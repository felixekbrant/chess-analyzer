import { describe, expect, it } from 'vitest';
import { moveIdea, moveIdeaSan } from './explain';

describe('moveIdea', () => {
  it('says what a capture wins', () => {
    expect(moveIdea('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', ['f3e5'], 'w')).toBe('wins their pawn on e5 for free');
    expect(moveIdea('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', ['d1d8', 'e8d8'], 'w')).toBe('trades queens with check');
  });
  it('finds forks, mates and threats', () => {
    expect(moveIdea('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', ['b5c7'], 'w')).toBe('forks their king and rook on a8 with check');
    expect(moveIdea('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', ['a1a8'], 'w')).toBe('is checkmate');
    // Seen from the other side: the knight's move attacks *your* rook.
    expect(moveIdea('4k3/8/8/8/3n4/8/8/R3K3 b - - 0 1', ['d4b3'], 'w', { forcing: true })).toBe('attacks your undefended rook on a1');
  });
  it('says what a move defends or rescues', () => {
    expect(moveIdea('4k3/8/8/4p3/3N4/8/8/4K3 w - - 0 1', ['d4f5'], 'w')).toBe('moves your knight out of the attack');
  });
  it('gives a boxed-in castled king an escape square, but not in the opening', () => {
    expect(moveIdea('6k1/8/8/8/8/8/5PPP/6K1 w - - 0 1', ['h2h3'], 'w')).toBe('gives your king an escape square');
    expect(moveIdea('4k3/8/8/8/8/8/3PPP2/4K3 w - - 0 1', ['d2d4'], 'w')).not.toBe('gives your king an escape square');
  });
  it('reads a line in SAN too', () => {
    expect(moveIdeaSan('4k3/8/8/4p3/8/5N2/8/4K3 w - - 0 1', ['Nxe5'], 'w')).toBe('wins their pawn on e5 for free');
  });
});
