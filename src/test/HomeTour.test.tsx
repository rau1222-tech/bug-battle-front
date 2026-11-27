import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HomeTour, { type TourStep } from '@/components/tour/HomeTour';

const steps: TourStep[] = [
  { id: 'a', title: 'Paso A', text: 'Texto del paso A', mood: '👋' },
  { id: 'b', target: 'missing', title: 'Paso B', text: 'Texto del paso B', mood: '🚀' },
];

describe('HomeTour', () => {
  it('reveals the typing text first, then advances and finishes', async () => {
    const onClose = vi.fn();
    render(<HomeTour steps={steps} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Texto del paso A', { selector: '[aria-hidden="true"]' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('Paso B')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '¡A cazar!' }));
    fireEvent.click(screen.getByRole('button', { name: '¡A cazar!' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can be skipped', () => {
    const onClose = vi.fn();
    render(<HomeTour steps={steps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Saltar intro' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
