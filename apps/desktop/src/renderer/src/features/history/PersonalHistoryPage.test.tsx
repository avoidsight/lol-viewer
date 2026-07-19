import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PersonalHistorySnapshot } from '../../../../shared/domain';
import PersonalHistoryPage from './PersonalHistoryPage';

const snapshot: PersonalHistorySnapshot = {
  playerId: 'me', displayName: '召唤师', profileIconId: 12, rank: undefined,
  matches: Array.from({ length: 22 }, (_, index) => ({ matchId: String(index), queueId: index % 2 ? 450 : 420, endedAt: 1_700_000_000_000 - index, durationSeconds: 1200, championId: index + 1, win: index % 2 === 0, kills: 8, deaths: 2, assists: 6 })),
  sampleSize: 20, wins: 12, losses: 8, winRate: 0.6, averageKda: 7,
  favoriteChampions: Array.from({ length: 6 }, (_, index) => ({ championId: index + 1, games: 4, wins: 3, winRate: 0.75 })),
  assetVersion: 'latest', cached: true, updatedAt: 1_700_000_000_000
};

describe('PersonalHistoryPage', () => {
  it('renders summary, five favorites, and twenty match rows', () => {
    render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    expect(screen.getByText('最近 20 场')).toBeVisible();
    expect(screen.getByText('未定级')).toBeVisible();
    expect(screen.getByText('缓存数据')).toBeVisible();
    expect(screen.getAllByTestId('favorite-champion')).toHaveLength(5);
    expect(screen.getAllByTestId('personal-match')).toHaveLength(20);
    expect(screen.getAllByText('极地大乱斗')).toHaveLength(10);
    const kdaValues = screen.getAllByLabelText('KDA');
    expect(kdaValues).toHaveLength(20);
    expect(kdaValues.every((element) => element.textContent === '8/2/6')).toBe(true);
  });

  it('organizes the dashboard into a hero, KPI strip, and 34/66 content split', () => {
    const { container } = render(<PersonalHistoryPage snapshot={snapshot} state="ready" />);
    expect(container.querySelector('.personal-history__hero')).toBeInTheDocument();
    expect(container.querySelector('.personal-history__hero-avatar')).toHaveAttribute('src');
    expect(container.querySelectorAll('.personal-history__kpi')).toHaveLength(4);
    expect(container.querySelector('.personal-history__content')).toBeInTheDocument();
    expect(container.querySelector('.personal-history__favorites-panel')).toBeInTheDocument();
    expect(container.querySelector('.personal-history__matches-panel')).toBeInTheDocument();
  });

  it('uses the deep-sea palette, compact rows, and required responsive tiers', () => {
    const css = readFileSync(resolve('src/renderer/src/features/history/personal-history.css'), 'utf8');
    expect(css).toMatch(/\.personal-history\s*{[^}]*background:\s*#070b16/i);
    expect(css).toMatch(/\.personal-history__content\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*34fr\)\s+minmax\(0,\s*66fr\)/i);
    expect(css).toMatch(/\.personal-history__matches article\s*{[^}]*min-height:\s*58px/i);
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/i);
    expect(css).toMatch(/@media\s*\(min-width:\s*720px\)\s+and\s+\(max-width:\s*1023px\)/i);
    expect(css).toMatch(/@media\s*\(max-width:\s*719px\)/i);
    expect(css).toMatch(/@media\s*\(max-width:\s*419px\)/i);
  });

  it('renders loading and unavailable states explicitly', () => {
    const { rerender } = render(<PersonalHistoryPage state="loading" />);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载个人战绩…');
    rerender(<PersonalHistoryPage state="unavailable" />);
    expect(screen.getByRole('alert')).toHaveTextContent('请先启动英雄联盟客户端');
  });
});
