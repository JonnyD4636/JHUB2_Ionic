import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
  });

  it('keeps the total and expenses scoped to the selected claim', () => {
    component.claims.set([
      { id: 'out', name: 'Outbound', createdAt: 1, archived: false },
      { id: 'back', name: 'Return', createdAt: 2, archived: false },
    ]);
    component.receipts.set([
      { id: 'a', claimId: 'out', capturedAt: 1, amountPence: 1250, description: '', photo: null },
      { id: 'b', claimId: 'back', capturedAt: 2, amountPence: 875, description: '', photo: null },
    ]);
    component.selectedClaimId = 'out';
    expect(component.totalPence).toBe(1250);
    expect(component.claimReceipts.map(item => item.id)).toEqual(['a']);
    component.selectedClaimId = 'back';
    expect(component.totalPence).toBe(875);
    expect(component.claimReceipts.map(item => item.id)).toEqual(['b']);
  });

  it('shows archived claims separately', () => {
    component.claims.set([
      { id: 'active', name: 'Active', createdAt: 1, archived: false },
      { id: 'archived', name: 'Archived', createdAt: 2, archived: true },
    ]);
    expect(component.visibleClaims.map(item => item.id)).toEqual(['active']);
    component.toggleArchiveView();
    expect(component.visibleClaims.map(item => item.id)).toEqual(['archived']);
    expect(component.selectedClaimId).toBe('archived');
  });
});
