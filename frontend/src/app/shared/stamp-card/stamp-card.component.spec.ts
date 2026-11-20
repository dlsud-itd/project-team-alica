import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StampCardComponent } from './stamp-card.component';
import { TicketStamp } from '../../core/attendee/attendee-progress.models';

describe('StampCardComponent', () => {
  let fixture: ComponentFixture<StampCardComponent>;

  const stamps: TicketStamp[] = [
    {
      checkpointId: 'b1',
      name: 'AWS Booth',
      location: 'A-1',
      type: 'BOOTH',
      parentId: null,
      visited: true,
      firstVisitedAt: '2026-11-20T01:00:00.000Z',
    },
    {
      checkpointId: 'b2',
      name: 'GDG Booth',
      location: 'A-2',
      type: 'BOOTH',
      parentId: null,
      visited: false,
      firstVisitedAt: null,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [StampCardComponent] }).compileComponents();
    fixture = TestBed.createComponent(StampCardComponent);
  });

  function render(opts: { visited: number; total: number; compact?: boolean }) {
    fixture.componentRef.setInput('progress', {
      visitedCount: opts.visited,
      totalCount: opts.total,
      percent: opts.total ? Math.round((opts.visited / opts.total) * 100) : 0,
      completed: opts.total > 0 && opts.visited >= opts.total,
    });
    fixture.componentRef.setInput('stamps', stamps);
    fixture.componentRef.setInput('compact', opts.compact ?? false);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows "X of Y booths visited" and a matching bar width', () => {
    const el = render({ visited: 1, total: 2 });
    expect(el.querySelector('.progress-label')?.textContent).toContain('1 of 2 booths visited');
    expect((el.querySelector('.progress-fill') as HTMLElement).style.width).toBe('50%');
    expect(el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuemax')).toBe('2');
  });

  it('renders one stamp per booth, marking visited ones', () => {
    const el = render({ visited: 1, total: 2 });
    const items = el.querySelectorAll('.stamp');
    expect(items.length).toBe(2);
    expect(items[0].classList.contains('visited')).toBe(true);
    expect(items[1].classList.contains('visited')).toBe(false);
  });

  it('hides the stamp grid in compact mode', () => {
    const el = render({ visited: 1, total: 2, compact: true });
    expect(el.querySelector('.stamp-grid')).toBeNull();
  });

  it('celebrates a completed card', () => {
    const el = render({ visited: 2, total: 2 });
    expect(el.querySelector('.progress-label')?.textContent).toContain('All 2 booths visited!');
  });
});
