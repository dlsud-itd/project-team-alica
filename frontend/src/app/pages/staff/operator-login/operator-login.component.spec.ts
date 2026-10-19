import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OperatorLogin } from './operator-login.component';

describe('OperatorLogin', () => {
  let component: OperatorLogin;
  let fixture: ComponentFixture<OperatorLogin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OperatorLogin],
    }).compileComponents();

    fixture = TestBed.createComponent(OperatorLogin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
