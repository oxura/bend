# A directly written CPS main keeps its continuation until the runtime supplies it.
import Base

def main() -> IO(Unit):
  R => k => IO.print("continued")(R, k)

#|continued
