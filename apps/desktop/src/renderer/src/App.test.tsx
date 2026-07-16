import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('shows the waiting state before the LoL client is available', () => {
    render(<App />);
    expect(screen.getByText('等待英雄联盟客户端')).toBeInTheDocument();
  });
});
