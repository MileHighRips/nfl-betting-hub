import type { Game } from './types';

interface PickQuote {
  type?: string;
  pickType?: string;
  side?: string;
  book?: string;
  price?: number;
  line?: number;
  player?: string;
  propMarket?: string;
}

/** Return the opposing price only when the selected book has the matching quote. */
export function opposingPriceForPick(
  game: Game | undefined,
  pick: PickQuote,
): number | undefined {
  if (!game) return undefined;
  const pickType = pick.pickType ?? pick.type;
  if (
    (pickType === 'Alt Spread' || pickType === 'Alt Total') &&
    pick.side &&
    pick.line != null &&
    pick.price != null
  ) {
    const ladder = game.altLines;
    const selected =
      pickType === 'Alt Spread'
        ? pick.side === 'home_spread'
          ? ladder?.spreadHome
          : ladder?.spreadAway
        : pick.side === 'over'
          ? ladder?.over
          : ladder?.under;
    const opposing =
      pickType === 'Alt Spread'
        ? pick.side === 'home_spread'
          ? ladder?.spreadAway
          : ladder?.spreadHome
        : pick.side === 'over'
          ? ladder?.under
          : ladder?.over;
    const selectedRung = selected?.find(
      (rung) => rung.line === pick.line && rung.price === pick.price,
    );
    const opposingRung = opposing?.find((rung) =>
      pickType === 'Alt Spread'
        ? Math.abs(Math.abs(rung.line) - Math.abs(pick.line!)) < 0.01
        : Math.abs(rung.line - pick.line!) < 0.01,
    );
    return selectedRung ? opposingRung?.price : undefined;
  }
  if (pickType === 'Prop' && pick.player && pick.propMarket) {
    const key = `${pick.player.trim().toLowerCase()}|${pick.propMarket}`;
    const quote = game.livePropLines?.[key];
    if (
      !quote ||
      quote.book !== pick.book ||
      quote.line !== pick.line
    )
      return undefined;
    if (pick.side === 'over' && pick.price === quote.overPrice) return quote.underPrice;
    if (pick.side === 'under' && pick.price === quote.underPrice) return quote.overPrice;
    return undefined;
  }

  const quote = game.books.find((book) => book.book === pick.book);
  if (!quote || pick.price == null) return undefined;
  if (pickType === 'Spread') {
    if (
      pick.side === 'home_spread' &&
      pick.line === quote.spread &&
      pick.price === quote.spreadPriceHome
    )
      return quote.spreadPriceAway;
    if (
      pick.side === 'away_spread' &&
      pick.line === -quote.spread &&
      pick.price === quote.spreadPriceAway
    )
      return quote.spreadPriceHome;
  } else if (pickType === 'Total') {
    if (pick.line !== quote.total) return undefined;
    if (pick.side === 'over' && pick.price === quote.overPrice) return quote.underPrice;
    if (pick.side === 'under' && pick.price === quote.underPrice) return quote.overPrice;
  } else if (pickType === 'Moneyline' || pickType === 'Upset') {
    if (pick.side === 'home_ml' && pick.price === quote.moneylineHome)
      return quote.moneylineAway;
    if (pick.side === 'away_ml' && pick.price === quote.moneylineAway)
      return quote.moneylineHome;
  }
  return undefined;
}
