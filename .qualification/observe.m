#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  @autoreleasepool {
    if (argc != 2) return 2;
    int pid = atoi(argv[1]);
    NSArray *all = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionAll, kCGNullWindowID));
    NSMutableArray *owned = [NSMutableArray array];
    for (NSDictionary *window in all) {
      if ([window[(__bridge NSString *)kCGWindowOwnerPID] intValue] == pid) [owned addObject:window];
    }
    CGRect display = CGDisplayBounds(CGMainDisplayID());
    NSDictionary *report = @{@"display": @{@"Width": @(display.size.width), @"Height": @(display.size.height)}, @"windows": owned};
    NSError *error = nil;
    NSData *json = [NSJSONSerialization dataWithJSONObject:report options:NSJSONWritingPrettyPrinted error:&error];
    if (!json) return 3;
    fwrite(json.bytes, 1, json.length, stdout);
    return 0;
  }
}
