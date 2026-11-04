import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AdminDashboard } from './dashboard.component';
import { AdminEvent } from '../../../core/admin/admin.models';

const API = `${environment.apiUrl}/events`;

const baseEvent: AdminEvent = {
  id: 'evt-1',
  organizer_id: 'usr-org',
  name: 'AI Workshop',
  starts_at: '2026-12-01T01:00:00.000Z',
  ends_at: '2026-12-01T04:00:00.000Z',
  venue: 'CBAA Lab 1',
  registrations_count: 0,
  capacity: 40,
  status: 'Upcoming',
  description: 'Hands-on agent building',
  allow_walk_ins: false,
  approval_status: 'Pending',
  review_notes: null,
  reviewed_at: null,
  submitted_at: '2026-10-29T00:00:00.000Z',
  organizer_name: 'Campus Organizer',
  organizer_email: 'organizer@alica.ph',
};

const APPROVED: AdminEvent = {
  ...baseEvent,
  id: 'evt-2',
  name: 'Tech Summit',
  approval_status: 'Approved',
  registrations_count: 12,
};

describe('AdminDashboard', () => {
  let component: AdminDashboard;
  let fixture: ComponentFixture<AdminDashboard>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminDashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminDashboard);
    component = fixture.componentInstance;
    httpMock
      .expectOne(`${API}/admin`)
      .flush({ success: true, data: [baseEvent, APPROVED] });
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('should load events and default to the pending tab', () => {
    expect(component.events().length).toBe(2);
    expect(component.counts().Pending).toBe(1);
    expect(component.counts().Approved).toBe(1);
    expect(component.totalRegistrations()).toBe(12);
    expect(component.filteredEvents().map((e) => e.id)).toEqual(['evt-1']);
  });

  it('should switch tabs and search by organizer', () => {
    component.activeTab.set('All');
    expect(component.filteredEvents().length).toBe(2);

    component.searchControl.setValue('summit');
    expect(component.filteredEvents().map((e) => e.id)).toEqual(['evt-2']);
  });

  it('should approve a pending event', () => {
    component.openReview(baseEvent);
    component.submitReview('APPROVED');

    const req = httpMock.expectOne(`${API}/evt-1/review`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ decision: 'APPROVED' });
    req.flush({ success: true, data: { ...baseEvent, approval_status: 'Approved' } });

    expect(component.reviewingEvent()).toBeNull();
    expect(component.counts().Pending).toBe(0);
    expect(component.notice()).toContain('approved');
  });

  it('should require notes before rejecting', () => {
    component.openReview(baseEvent);
    component.submitReview('REJECTED');

    httpMock.expectNone(`${API}/evt-1/review`);
    expect(component.reviewError()).toContain('reason');
    expect(component.reviewingEvent()).not.toBeNull();
  });

  it('should reject with notes', () => {
    component.openReview(baseEvent);
    component.reviewNotes.setValue('Venue is unavailable that day.');
    component.submitReview('REJECTED');

    const req = httpMock.expectOne(`${API}/evt-1/review`);
    expect(req.request.body).toEqual({
      decision: 'REJECTED',
      notes: 'Venue is unavailable that day.',
    });
    req.flush({
      success: true,
      data: { ...baseEvent, approval_status: 'Rejected', review_notes: 'Venue is unavailable that day.' },
    });

    expect(component.counts().Rejected).toBe(1);
  });

  it('should keep the dialog open and show API errors', () => {
    component.openReview(baseEvent);
    component.submitReview('APPROVED');
    httpMock
      .expectOne(`${API}/evt-1/review`)
      .flush({ message: 'Only administrators can review events' }, { status: 403, statusText: 'Forbidden' });

    expect(component.reviewError()).toBe('Only administrators can review events');
    expect(component.reviewingEvent()).not.toBeNull();
  });
});
