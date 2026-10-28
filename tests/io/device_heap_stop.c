#include <sys/wait.h>

static u32 device_heap_host(void) {
  pid_t child = fork();
  if (child < 0) return 1;
  if (child == 0) {
    int sink = open("/dev/null", O_WRONLY);
    if (sink < 0 || dup2(sink, 2) < 0) _exit(98);
    if (sink != 2) close(sink);
    err_post(NULL, ERR_HEAP);
    _exit(99);
  }
  int status;
  pid_t waited;
  do { waited = waitpid(child, &status, 0); } while (waited < 0 && errno == EINTR);
  return waited == child && WIFEXITED(status) && WEXITSTATUS(status) == 1 ? 0 : 1;
}

#if BEND_METAL
static u32 device_heap_metal(id<MTLDevice> device) {
  static const char probe[] =
    "\nkernel void heap_checkpoint(device u64* H [[buffer(0)]], "
    "device u32* result [[buffer(1)]], uint lane [[thread_position_in_grid]]) {\n"
    "  Env e = { H, H + ALC_OFF + lane };\n"
    "  u64 loc = heap_alloc_miss(e, 0);\n"
    "  u32 poll = 0;\n"
    "  result[lane * 4 + 2] = err_spun(e.mem, &poll);\n"
    "  result[lane * 4] = a32_load(a32_at(H, H_ERROR_CODE));\n"
    "  result[lane * 4 + 1] = loc == HEAP_OFF;\n"
    "  result[lane * 4 + 3] = poll;\n"
    "}\n";
  NSError* error = nil;
  MTLCompileOptions* options = [MTLCompileOptions new];
  options.mathMode = MTLMathModeSafe;
  options.preprocessorMacros = @{ @"CUBE_LOG": @(CUBE_LOG) };
  NSString* source = [@(BEND_SRC) stringByAppendingString:@(probe)];
  id<MTLLibrary> library = [device newLibraryWithSource:source options:options error:&error];
  if (!library) {
    fprintf(stderr, "heap checkpoint shader: %s\n", [[error localizedDescription] UTF8String]);
    return 8;
  }
  id<MTLComputePipelineState> pipeline = [device
    newComputePipelineStateWithFunction:[library newFunctionWithName:@"heap_checkpoint"]
    error:&error];
  if (!pipeline) return 16;
  u64 bytes = (HEAP_OFF + PAGE_LEN) * sizeof(u64);
  id<MTLBuffer> memory = [device newBufferWithLength:bytes options:MTLResourceStorageModeShared];
  id<MTLBuffer> result = [device newBufferWithLength:CUBE_T * 4 * sizeof(u32)
    options:MTLResourceStorageModeShared];
  if (!memory || !result) return 32;
  memset([memory contents], 0, bytes);
  memset([result contents], 0, CUBE_T * 4 * sizeof(u32));
  id<MTLCommandQueue> queue = [device newCommandQueue];
  id<MTLCommandBuffer> command = [queue commandBuffer];
  id<MTLComputeCommandEncoder> encoder = [command computeCommandEncoder];
  [encoder setComputePipelineState:pipeline];
  [encoder setBuffer:memory offset:0 atIndex:0];
  [encoder setBuffer:result offset:0 atIndex:1];
  [encoder dispatchThreadgroups:MTLSizeMake(1, 1, 1)
    threadsPerThreadgroup:MTLSizeMake(CUBE_T, 1, 1)];
  [encoder endEncoding];
  [command commit];
  [command waitUntilCompleted];
  if ([command error]) return 64;
  u32* values = [result contents];
  u32 failed = 0;
  for (u32 lane = 0; lane < CUBE_T; ++lane) {
    u32* r = values + lane * 4;
    u32 bad = (r[0] != ERR_HEAP) | ((r[1] != 1) << 1) | ((!r[2]) << 2);
    if (bad && !failed) {
      fprintf(stderr, "heap checkpoint: code=%u sink=%u stopped=%u polls=%u\n",
        r[0], r[1], r[2], r[3]);
    }
    failed |= bad;
  }
  return failed;
}
#endif

static Term device_heap_test(Env e, Term* f, IoWork* w) {
#if BEND_METAL
  @autoreleasepool {
    id<MTLDevice> device = MTLCreateSystemDefaultDevice();
    if (device) return device_heap_metal(device);
  }
#endif
  return device_heap_host();
}

__attribute__((constructor)) static void device_heap_use(void) {
  io_eff(CID(DeviceHeap.test), device_heap_test);
}
