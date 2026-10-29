import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { OrganizerDashboard } from './dashboard.component';

describe('OrganizerDashboard', () => {
  let component: OrganizerDashboard;
  let fixture: ComponentFixture<OrganizerDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrganizerDashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrganizerDashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
