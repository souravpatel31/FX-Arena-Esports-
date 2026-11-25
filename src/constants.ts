import { Game, Tournament } from './types';
import { MODE_BR_URL, MODE_CS_URL, MODE_LW_URL } from './utils/assetUrl';

export interface GameMode {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  category: string;
}

export const GAME_MODES_DATA: Record<string, GameMode[]> = {
  freefire: [
    { id: 'br_solo', title: 'BR SOLO', subtitle: 'Battle Royale', category: 'Battle Royale', image: MODE_BR_URL },
    { id: 'br_duo', title: 'BR DUO', subtitle: 'Battle Royale', category: 'Battle Royale', image: MODE_BR_URL },
    { id: 'br_squad', title: 'BR SQUAD', subtitle: 'Battle Royale', category: 'Battle Royale', image: MODE_BR_URL },
    { id: 'cs_solo', title: 'CS SOLO', subtitle: 'Clash Squad', category: 'Clash Squad', image: MODE_CS_URL },
    { id: 'cs_duo', title: 'CS DUO', subtitle: 'Clash Squad', category: 'Clash Squad', image: MODE_CS_URL },
    { id: 'cs_squad', title: 'CS SQUAD', subtitle: 'Clash Squad', category: 'Clash Squad', image: MODE_CS_URL },
    { id: 'lone_wolf_solo', title: 'LONE WOLF SOLO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: MODE_LW_URL },
    { id: 'lone_wolf_duo', title: 'LONE WOLF DUO', subtitle: 'Lone Wolf', category: 'Lone Wolf', image: MODE_LW_URL },
  ]
};

export const GAMES: Game[] = [
  {
    id: 'freefire',
    title: 'Free Fire',
    image: MODE_BR_URL,
    players: 850,
  }
];


