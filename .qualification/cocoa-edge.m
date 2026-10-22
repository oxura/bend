#import <Cocoa/Cocoa.h>
#import <QuartzCore/QuartzCore.h>
#import <objc/message.h>
#import <objc/runtime.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

@interface NSView (BendQualification)
- (CGSize)logicalSize;
@end

static const char *edgeMode;
static BOOL injected;
static _Atomic double reportedScale;
static void (*realToggle)(id, SEL, id);
static CGFloat (*realScale)(id, SEL);

static BOOL ownsWindow(NSWindow *window) {
  return [window.title isEqualToString:@"bend-1443-cocoa-review"];
}

static CGFloat edgeScale(id object, SEL selector) {
  double scale = atomic_load(&reportedScale);
  return scale > 0 && ownsWindow(object) ? scale : realScale(object, selector);
}

static void edgeToggle(id object, SEL selector, id sender) {
  NSWindow *window = object;
  if (!ownsWindow(window)) {
    realToggle(object, selector, sender);
    return;
  }
  BOOL full = (window.styleMask & NSWindowStyleMaskFullScreen) != 0;
  if (!injected && strcmp(edgeMode, "ignore") == 0) {
    injected = YES;
    printf("EDGE:ignore-toggle\n");
    fflush(stdout);
    return;
  }
  if (!injected && ((!full && strcmp(edgeMode, "fail-enter") == 0)
                || (full && strcmp(edgeMode, "fail-exit") == 0))) {
    injected = YES;
    SEL failure = NSSelectorFromString(full
      ? @"windowDidFailToExitFullScreen:" : @"windowDidFailToEnterFullScreen:");
    id delegate = window.delegate;
    if (![delegate respondsToSelector:failure]) abort();
    ((void (*)(id, SEL, id))objc_msgSend)(delegate, failure, window);
    printf("EDGE:%s-notification\n", full ? "fail-exit" : "fail-enter");
    fflush(stdout);
    return;
  }
  if (strcmp(edgeMode, "scale") == 0) {
    NSView *view = window.contentView;
    CGSize before = [view logicalSize];
    double scale = atomic_load(&reportedScale) == 2 ? 1 : 2;
    atomic_store(&reportedScale, scale);
    [view viewDidChangeBackingProperties];
    CGSize after = [view logicalSize];
    CGSize drawable = ((CAMetalLayer *)view.layer).drawableSize;
    if (before.width != 97 || before.height != 65
        || after.width != before.width || after.height != before.height
        || drawable.width != 97 || drawable.height != 65) abort();
    printf("EDGE:scale=%.0f logical=%.0fx%.0f drawable=%.0fx%.0f\n",
      scale, after.width, after.height, drawable.width, drawable.height);
    fflush(stdout);
  }
  realToggle(object, selector, sender);
}

__attribute__((constructor)) static void installBoundaryProbe(void) {
  edgeMode = getenv("BEND_COCOA_EDGE_MODE");
  if (edgeMode == NULL || strcmp(edgeMode, "normal") == 0) return;
  Method toggle = class_getInstanceMethod(NSWindow.class, @selector(toggleFullScreen:));
  realToggle = (void (*)(id, SEL, id))method_getImplementation(toggle);
  method_setImplementation(toggle, (IMP)edgeToggle);
  if (strcmp(edgeMode, "scale") == 0) {
    Method scale = class_getInstanceMethod(NSWindow.class, @selector(backingScaleFactor));
    realScale = (CGFloat (*)(id, SEL))method_getImplementation(scale);
    method_setImplementation(scale, (IMP)edgeScale);
  }
}
