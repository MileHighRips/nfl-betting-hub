import { promises as fs } from 'fs';
import path from 'path';
import type { HandicapReview, HandicapReviewStore } from './handicap-review-schema';

const STORE_DIR = path.join(process.cwd(), 'data', 'store');
const STORE_FILE = path.join(STORE_DIR, 'handicap-reviews.json');

export async function readHandicapReviews(): Promise<HandicapReviewStore> {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf-8')) as HandicapReviewStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export async function saveHandicapReview(review: HandicapReview): Promise<void> {
  const store = await readHandicapReviews();
  store[review.snapshot.key] = review;
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
}
