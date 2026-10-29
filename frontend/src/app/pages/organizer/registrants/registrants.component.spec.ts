import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OrganizerRegistrants } from './registrants.component';

describe('OrganizerRegistrants', () => {
  let component: OrganizerRegistrants;
  let fixture: ComponentFixture<OrganizerRegistrants>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerRegistrants],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizerRegistrants);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render correct status CSS class', () => {
    expect(component.statusClass('Checked In')).toBe('status-checked-in');
    expect(component.statusClass('Cancelled')).toBe('status-cancelled');
    expect(component.statusClass('Registered')).toBe('status-registered');
  });
});

