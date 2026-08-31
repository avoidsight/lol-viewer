import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';

describe('AppShell', () => {
  it('exposes three accessible tabs including settings and selects history', () => {
    render(<AppShell active="history" onChange={vi.fn()}><p>History body</p></AppShell>);
    expect(screen.getByRole('tab', { name: '战绩' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tab', { name: '设置' })).toBeVisible();
    expect(screen.queryByRole('tab', { name: '英雄资料库' })).not.toBeInTheDocument();
    expect(screen.getByRole('tabpanel')).toHaveTextContent('History body');
  });

  it('reports tab changes to its caller', () => {
    const onChange = vi.fn();
    render(<AppShell active="history" onChange={onChange}><p>History body</p></AppShell>);
    fireEvent.click(screen.getByRole('tab', { name: '设置' }));
    expect(onChange).toHaveBeenCalledWith('settings');
  });

  it('draws attention on the live tab while preserving its accessible name', () => {
    render(<AppShell active="history" onChange={vi.fn()} liveAttention><p>History body</p></AppShell>);
    expect(screen.getByRole('tab', { name: '对战信息' })).toHaveClass('app-shell__tab--attention');
    expect(screen.getByRole('tab', { name: '战绩' })).not.toHaveClass('app-shell__tab--attention');
  });

  it.each([
    ['ArrowRight', 'history', 'live'],
    ['ArrowLeft', 'settings', 'live'],
    ['Home', 'settings', 'history'],
    ['End', 'history', 'settings']
  ])('handles %s with roving focus', (key, active, expected) => {
    const onChange = vi.fn();
    render(<AppShell active={active as 'history' | 'live' | 'settings'} onChange={onChange}><p>Body</p></AppShell>);
    const labels = { history: '战绩', live: '对战信息', settings: '设置' } as const;
    const current = screen.getByRole('tab', { name: labels[active as keyof typeof labels] });
    fireEvent.keyDown(current, { key });
    const target = screen.getByRole('tab', { name: labels[expected as keyof typeof labels] });
    expect(onChange).toHaveBeenCalledWith(expected);
    expect(target).toHaveFocus();
    expect(current).toHaveAttribute('tabindex', '-1');
    expect(target).toHaveAttribute('tabindex', '0');
    expect(target).toHaveAttribute('aria-selected', 'true');
  });
});
