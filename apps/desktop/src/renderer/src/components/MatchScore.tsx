import type { rankedMatchForm } from '../features/live/ranked-form';
import './match-score.css';

export default function MatchScore({ form, win, className = '' }: {
  form: ReturnType<typeof rankedMatchForm>;
  win: boolean;
  className?: string;
}) {
  if (!form) return null;
  const score = Math.round(form.score);
  return <span className={`${className} match-score ${win ? 'is-win' : 'is-loss'}`}
    data-testid="match-score" aria-label={`综合评分 ${score}/100`}
    title={`综合评分 ${score}/100 · 自定义综合评分，非官方\n${form.description}`}>{score}</span>;
}
