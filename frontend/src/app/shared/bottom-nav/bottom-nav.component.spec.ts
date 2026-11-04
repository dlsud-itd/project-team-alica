import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BottomNav } from './bottom-nav.component';

describe('BottomNav', () => {
  let fixture: ComponentFixture<BottomNav>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomNav],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(BottomNav);
    fixture.componentRef.setInput('items', [
      { label: 'Events', path: '/events' },
      { label: 'Profile', path: '/profile' },
    ]);
    await fixture.whenStable();
  });

  it('renders a link per item', () => {
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0].textContent?.trim()).toBe('Events');
  });
});
