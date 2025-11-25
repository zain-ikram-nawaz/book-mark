import { timers } from './webhook';

export default function handler(req, res) {
  res.status(200).json({ timers });
}
