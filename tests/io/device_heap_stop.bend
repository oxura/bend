import Base

def DeviceHeap.test() -> IO(U32):
  import "./device_heap_stop.c"
  import "./device_heap_stop.js"

def device_heap_increment(x: U32) -> U32:
  (x + 1 : U32)

def main() -> IO(Unit):
  do IO<Unit>:
    result : U32 <- DeviceHeap.test()
    IO.print(U32.show((device_heap_increment!(result) - 1 : U32)))

#|0
