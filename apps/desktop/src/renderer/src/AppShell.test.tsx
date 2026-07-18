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
});
