#define main bend_generated_main
#include "cocoa-product.c"
#undef main
#import <objc/runtime.h>
#include <assert.h>
static NSWindow *target;
static BendView *view;
static const char *mode;
static NSUInteger savedStyle, savedBehavior;
static BOOL delayed, observedPastDeadline, detached;
static void (*realDid)(id,SEL,NSNotification*);
static void (*realDelegate)(id,SEL,id);
static void setDelegate(id object,SEL sel,id delegate) {
  NSWindow *win=object;
  if(win==target && delegate==nil) {
    BendView *v=(BendView*)win.contentView;
    assert(!v->full_busy && !(win.styleMask&NSWindowStyleMaskFullScreen));
    assert(win.styleMask==savedStyle && win.collectionBehavior==savedBehavior);
    detached=YES;
    printf("DELEGATE:DETACHED-AFTER-EXIT\n");fflush(stdout);
  }
  realDelegate(object,sel,delegate);
}
static void didTransition(id object,SEL sel,NSNotification *notification) {
  if(object!=view || delayed) {realDid(object,sel,notification);return;}
  delayed=YES;
  printf("BOUNDARY:real-Did-callback-held-7s:%s\n",sel_getName(sel));fflush(stdout);
  [NSTimer scheduledTimerWithTimeInterval:7 repeats:NO block:^(NSTimer *timer) {
    realDid(object,sel,notification);
    printf("BOUNDARY:real-Did-callback-forwarded\n");fflush(stdout);
  }];
}
static void pump(void) {
  @autoreleasepool {
    NSEvent *event=[NSApp nextEventMatchingMask:NSEventMaskAny untilDate:NSDate.distantPast inMode:NSDefaultRunLoopMode dequeue:YES];
    if(event)[NSApp sendEvent:event];
    CFRunLoopRunInMode(kCFRunLoopDefaultMode,0.005,true);
    [view fullTick];
  }
}
static void waitState(BOOL full,BOOL started) {
  u64 deadline=io_tick()+15000000000ull;
  while(io_tick()<deadline) {
    if(started ? view->full_started : (!view->full_busy && ((target.styleMask&NSWindowStyleMaskFullScreen)!=0)==full))return;
    pump();
  }
  fprintf(stderr,"native Cocoa transition did not reach requested state\n");abort();
}
int main(int argc,char **argv) {
  @autoreleasepool {
    assert(argc==2);mode=argv[1];
    intptr_t at=0;const char *why=NULL;
    u32 err=window_make("bend-1443-close-review",97,65,&at,&why);
    if(err){fprintf(stderr,"Window.open %u: %s\n",err,why);return 1;}
    NSWindow *win=(__bridge NSWindow*)(void*)at;
    BendView *v=(BendView*)win.contentView;target=win;view=v;
    win.collectionBehavior=NSWindowCollectionBehaviorManaged|NSWindowCollectionBehaviorParticipatesInCycle;
    savedStyle=win.styleMask;savedBehavior=win.collectionBehavior;
    Method delegate=class_getInstanceMethod(NSWindow.class,@selector(setDelegate:));
    realDelegate=(void(*)(id,SEL,id))method_getImplementation(delegate);
    method_setImplementation(delegate,(IMP)setDelegate);
    if(strcmp(mode,"close-enter")==0) {
      Method did=class_getInstanceMethod(BendView.class,@selector(windowDidEnterFullScreen:));
      realDid=(void(*)(id,SEL,NSNotification*))method_getImplementation(did);
      method_setImplementation(did,(IMP)didTransition);
    }
    assert(window_fullscreen(at,true,&why)==0);
    if(strcmp(mode,"close-enter")==0)waitState(YES,YES);
    else {
      waitState(YES,NO);
      if(strcmp(mode,"close-exit")==0) {
        Method did=class_getInstanceMethod(BendView.class,@selector(windowDidExitFullScreen:));
        realDid=(void(*)(id,SEL,NSNotification*))method_getImplementation(did);
        method_setImplementation(did,(IMP)didTransition);
      } else assert(strcmp(mode,"restore")==0);
      assert(window_fullscreen(at,false,&why)==0);
      waitState(NO,strcmp(mode,"close-exit")==0);
    }
    BOOL transition=strcmp(mode,"restore")!=0;
    if(transition) {
      assert(v->full_busy && v->full_started);
      [NSTimer scheduledTimerWithTimeInterval:6 repeats:NO block:^(NSTimer *timer) {
        assert(view->full_busy && view->full_started && !detached);
        assert(target.delegate==view && target.contentView==view);
        assert(io_tick()>=view->full_due);
        observedPastDeadline=YES;
        printf("PAST-DEADLINE:busy-started-delegate-attached\n");fflush(stdout);
      }];
    } else assert(win.styleMask==savedStyle && win.collectionBehavior==savedBehavior);
    u64 before=io_tick();window_close(at);double seconds=(io_tick()-before)/1e9;
    assert(detached);
    if(transition)assert(delayed && observedPastDeadline && seconds>=6);
    printf("{\"mode\":\"%s\",\"close_seconds\":%.3f,\"style_restored\":true,\"collection_behavior_restored\":true,\"callback_delayed\":%s,\"past_deadline_observed\":%s,\"pass\":true}\n",mode,seconds,delayed?"true":"false",observedPastDeadline?"true":"false");
    return 0;
  }
}
