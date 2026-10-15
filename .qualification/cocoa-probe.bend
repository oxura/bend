import Base

def build(+d: Nat, +x: U32, +y: U32) -> Image:
  match d:
    case 0n:
      Pix{(x + 256 * y : U32)}
    case 1n+e:
      +h = U32.shln(1, e)
      a b c d = build(e, x, y) build(e, (x + h : U32), y)
        build(e, x, (y + h : U32)) build(e, (x + h : U32), (y + h : U32))
      Qua{a, b, c, d}

def full_answer(p: Window & Result<&1, &1, U32 & String, Unit>) -> IO(Window):
  (w, r) = p
  match r:
    case Done{u}:
      do IO<Window>:
        IO.print("FULL:OK")
        IO.pure(Window, w)
    case Fail{(code, text)}:
      do IO<Window>:
        IO.print("FULL:ERR:" ++ U32.show(code) ++ ":" ++ text)
        IO.pure(Window, w)

def full(w: Window, on: Bool) -> IO(Window):
  do IO<Window>:
    p : Window & Result<&1, &1, U32 & String, Unit> <- Window.fullscreen(w, on)
    full_answer(p)

def framed(p: Window & Image & List<Event>, k: Window -> Image -> IO(Unit)) -> IO(Unit):
  (w, im, es) = p
  k(w, im)

def frames(n: Nat, w: Window, im: Image, k: Window -> Image -> IO(Unit)) -> IO(Unit):
  match n:
    case 0n:
      k(w, im)
    case 1n+m:
      IO.bind(Window & Image & List<Event>, Unit, Window.frame(w, im), p =>
        framed(p, win => image => frames(m, win, image, k)))

def finished(w: Window, im: Image) -> IO(Unit):
  do IO<Unit>:
    Window.close(w)
    IO.print("CLOSED")

def third(w: Window, im: Image) -> IO(Unit):
  do IO<Unit>:
    IO.print("ENTER:SECOND")
    w2 : Window <- full(w, True{})
    frames(300n, w2, im, finished)

def second(w: Window, im: Image) -> IO(Unit):
  do IO<Unit>:
    IO.print("EXIT:FIRST")
    w2 : Window <- full(w, False{})
    frames(300n, w2, im, third)

def opened(r: Result<&1, &1, U32 & String, Window>) -> IO(Unit):
  match r:
    case Fail{(code, text)}:
      IO.print("OPEN:ERR:" ++ U32.show(code) ++ ":" ++ text)
    case Done{w}:
      do IO<Unit>:
        IO.print("ENTER:FIRST")
        w2 : Window <- full(w, True{})
        frames(300n, w2, build(7n, 0, 0), second)

def main() -> IO(Unit):
  do IO<Unit>:
    r : Result<&1, &1, U32 & String, Window> <- Window.open("bend-1443-cocoa-review", 97, 65)
    opened(r)
