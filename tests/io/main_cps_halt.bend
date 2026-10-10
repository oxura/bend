# The runtime enters main with no arguments; its IO continuation stays a closure.
import Base

def main() -> IO(Unit):
  R => k => Halt{2, "direct halt"}

#|direct halt
#|exit 2
