import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppShell from './AppShell';

describe('AppShell', () => {
  it('exposes three accessible tabs and selects history', () => {
    render(<AppShell active="history" onChange={vi.fn()}><p>History body</p></AppShell>);
    expect(screen.getByRole('tab', { name: '战绩' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(screen.getByRole('tabpanel')).toHaveTextContent('History body');
  });

  it('reports tab changes to its caller', () => {
    const onChange = vi.fn();
    render(<AppShell active="history" onChange={onChange}><p>History body</p></AppShell>);
    fireEvent.click(screen.getByRole('tab', { name: '英雄资料库' }));
    expect(onChange).toHaveBeenCalledWith('champions');
  });

  it.each([
    ['ArrowRight', 'champions', 'history'],
    ['ArrowLeft', 'history', 'champions'],
    ['Home', 'champions', 'history'],
    ['End', 'history', 'champions']
  ])('handles %s with roving focus', (key, active, expected) => {
    const onChange = vi.fn();
    render(<AppShell active={active as 'history' | 'champions'} onChange={onChange}><p>Body</p></AppShell>);
    const current = screen.getByRole('tab', { name: active === 'history' ? '战绩' : '英雄资料库' });
    fireEvent.keyDown(current, { key });
    const target = screen.getByRole('tab', { name: expected === 'history' ? '战绩' : '英雄资料库' });
    expect(onChange).toHaveBeenCalledWith(expected);
    expect(target).toHaveFocus();
    expect(current).toHaveAttribute('tabindex', '-1');
    expect(target).toHaveAttribute('tabindex', '0');
    expect(target).toHaveAttribute('aria-selected', 'true');
  });
});
