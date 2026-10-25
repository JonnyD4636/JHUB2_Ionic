import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { createClaimPdf } from '../claim-export';
import { saveNativePdf } from '../native-export';

interface Claim { id: string; name: string; createdAt: number; archived: boolean }
interface Receipt { id: string; claimId?: string; capturedAt: number; amountPence: number; description: string; photo: Blob | null; source?: 'camera' | 'upload' | 'manual'; serial?: string; photoUrl?: string }
const DB = 'receipt-ledger';
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('receipts')) request.result.createObjectStore('receipts', { keyPath: 'id' });
      if (!request.result.objectStoreNames.contains('claims')) request.result.createObjectStore('claims', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function action<T>(storeName: 'claims' | 'receipts', mode: IDBTransactionMode, operate: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = operate(transaction.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => db.close();
    transaction.oncomplete = () => { db.close(); resolve(result); };
  });
}
async function deleteClaimAndReceipts(claimId: string): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['claims', 'receipts'], 'readwrite');
    transaction.objectStore('claims').delete(claimId);
    const store = transaction.objectStore('receipts');
    store.openCursor().onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (!cursor) return;
      if ((cursor.value as Receipt).claimId === claimId) cursor.delete();
      cursor.continue();
    };
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
    transaction.onabort = () => { db.close(); reject(transaction.error); };
  });
}
@Component({ selector: 'app-home', templateUrl: 'home.page.html', styleUrls: ['home.page.scss'], imports: [CommonModule, FormsModule, IonContent] })
export class HomePage implements OnInit, OnDestroy {
  readonly receipts = signal<Receipt[]>([]);
  readonly claims = signal<Claim[]>([]);
  readonly busy = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  selectedClaimId: string | null = null;
  showArchived = false;
  claimEditorOpen = false;
  claimEditingId: string | null = null;
  claimName = '';
  editorOpen = false;
  editingId: string | null = null;
  photo: Blob | null = null;
  previewUrl: string | null = null;
  capturedAt = Date.now();
  amount = '';
  description = '';
  serial = '';
  source: 'camera' | 'upload' | 'manual' = 'camera';

  get visibleClaims(): Claim[] { return this.claims().filter(claim => claim.archived === this.showArchived); }
  get selectedClaim(): Claim | undefined { return this.claims().find(claim => claim.id === this.selectedClaimId); }
  get claimReceipts(): Receipt[] { return this.receipts().filter(receipt => receipt.claimId === this.selectedClaimId); }
  get totalPence(): number { return this.claimReceipts.reduce((sum, item) => sum + item.amountPence, 0); }
  claimTotal(id: string): number { return this.receipts().filter(item => item.claimId === id).reduce((sum, item) => sum + item.amountPence, 0); }
  claimCount(id: string): number { return this.receipts().filter(item => item.claimId === id).length; }
  get canSave(): boolean { return !!this.selectedClaim && !this.selectedClaim.archived && this.validAmount && !this.busy() && (this.source === 'manual' ? !!this.serial.trim() : !!this.photo); }
  get validAmount(): boolean { return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(this.amount.trim()) && Number(this.amount) > 0; }
  async ngOnInit(): Promise<void> { await this.refresh(); }
  ngOnDestroy(): void { this.receipts().forEach(item => { if (item.photoUrl) URL.revokeObjectURL(item.photoUrl); }); if (this.previewUrl) URL.revokeObjectURL(this.previewUrl); }
  formatMoney(pence: number): string { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100); }
  selectClaim(claim: Claim): void { this.selectedClaimId = claim.id; this.showArchived = claim.archived; }
  toggleArchiveView(): void { this.showArchived = !this.showArchived; this.selectedClaimId = this.visibleClaims[0]?.id ?? null; }
  openClaimEditor(claim?: Claim): void { this.claimEditingId = claim?.id ?? null; this.claimName = claim?.name ?? ''; this.claimEditorOpen = true; this.error.set(''); }
  closeClaimEditor(): void { this.claimEditorOpen = false; this.claimEditingId = null; this.claimName = ''; this.error.set(''); }
  async saveClaim(): Promise<void> {
    const name = this.claimName.trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    try {
      const existing = this.claims().find(item => item.id === this.claimEditingId);
      const claim: Claim = existing ? { ...existing, name } : { id: crypto.randomUUID(), name, createdAt: Date.now(), archived: false };
      await action('claims', 'readwrite', store => store.put(claim));
      await this.refresh(); this.selectClaim(claim); this.closeClaimEditor();
    } catch { this.error.set('Could not save this claim. Please try again.'); }
    finally { this.busy.set(false); }
  }
  async toggleArchive(): Promise<void> {
    const claim = this.selectedClaim;
    if (!claim || this.busy()) return;
    this.busy.set(true);
    try { await action('claims', 'readwrite', store => store.put({ ...claim, archived: !claim.archived })); await this.refresh(); this.selectedClaimId = this.visibleClaims[0]?.id ?? null; }
    catch { this.error.set('Could not update this claim. Please try again.'); }
    finally { this.busy.set(false); }
  }
  async exportClaim(): Promise<void> {
    const claim = this.selectedClaim;
    if (!claim || this.exporting()) return;
    this.exporting.set(true);
    this.error.set('');
    try {
      const pdf = await createClaimPdf(claim.name, this.claimReceipts);
      const fileName = `${claim.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'claim'}-receiptly.pdf`;
      if (Capacitor.isNativePlatform()) {
        await saveNativePdf(pdf, fileName);
        return;
      }
      const url = URL.createObjectURL(pdf);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch {
      this.error.set('Could not export this claim. Please try again.');
    } finally {
      this.exporting.set(false);
    }
  }  async deleteClaim(): Promise<void> {
    const claim = this.selectedClaim;
    if (!claim || this.busy() || !window.confirm(`Delete “${claim.name}” and all its expenses? This cannot be undone.`)) return;
    this.busy.set(true);
    try { await deleteClaimAndReceipts(claim.id); this.selectedClaimId = null; await this.refresh(); }
    catch { this.error.set('Could not delete this claim. Please try again.'); }
    finally { this.busy.set(false); }
  }
  openNew(): void { if (!this.selectedClaim || this.selectedClaim.archived) return; this.closeEditor(); this.capturedAt = Date.now(); this.editorOpen = true; }
  openEdit(item: Receipt): void { if (this.selectedClaim?.archived) return; this.closeEditor(); this.editingId = item.id; this.photo = item.photo; this.previewUrl = item.photo?.type.startsWith('image/') ? URL.createObjectURL(item.photo) : null; this.capturedAt = item.capturedAt; this.amount = (item.amountPence / 100).toFixed(2); this.description = item.description; this.serial = item.serial ?? ''; this.source = item.source ?? 'camera'; this.editorOpen = true; }
  closeEditor(): void { this.editorOpen = false; this.editingId = null; this.photo = null; if (this.previewUrl) URL.revokeObjectURL(this.previewUrl); this.previewUrl = null; this.amount = ''; this.description = ''; this.serial = ''; this.source = 'camera'; this.error.set(''); }
  setSource(source: 'camera' | 'upload' | 'manual'): void { if (this.source !== source) { this.photo = null; if (this.previewUrl) URL.revokeObjectURL(this.previewUrl); this.previewUrl = null; } this.source = source; this.error.set(''); }
  choosePhoto(event: Event, source: 'camera' | 'upload'): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !(source === 'upload' && file.type === 'application/pdf')) { this.error.set('Please choose an image or PDF receipt.'); input.value = ''; return; }
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl);
    this.photo = file; this.previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null; this.source = source; this.capturedAt = Date.now(); this.error.set(''); input.value = '';
  }
  async save(): Promise<void> {
    if (!this.canSave) return;
    this.busy.set(true); this.error.set('');
    try {
      const receipt: Receipt = { id: this.editingId ?? crypto.randomUUID(), claimId: this.selectedClaimId!, capturedAt: this.capturedAt, amountPence: Math.round(Number(this.amount) * 100), description: this.description.trim(), serial: this.serial.trim(), source: this.source, photo: this.source === 'manual' ? null : this.photo };
      await action('receipts', 'readwrite', store => store.put(receipt));
      await this.refresh(); this.closeEditor();
    } catch { this.error.set('Could not save this expense. Check available device storage and try again.'); }
    finally { this.busy.set(false); }
  }
  async remove(): Promise<void> {
    if (!this.editingId || this.busy() || !window.confirm('Delete this expense? This cannot be undone.')) return;
    this.busy.set(true);
    try { await action('receipts', 'readwrite', store => store.delete(this.editingId!)); await this.refresh(); this.closeEditor(); }
    catch { this.error.set('Could not delete this expense. Please try again.'); }
    finally { this.busy.set(false); }
  }
  private async refresh(): Promise<void> {
    try {
      let claims = await action<Claim[]>('claims', 'readonly', store => store.getAll());
      let saved = await action<Receipt[]>('receipts', 'readonly', store => store.getAll());
      if (saved.some(receipt => !receipt.claimId)) {
        let legacyClaim = claims.find(claim => claim.id === 'legacy-claim');
        if (!legacyClaim) { legacyClaim = { id: 'legacy-claim', name: 'Earlier expenses', createdAt: Date.now(), archived: false }; await action('claims', 'readwrite', store => store.put(legacyClaim!)); claims = [...claims, legacyClaim]; }
        saved = await Promise.all(saved.map(async receipt => {
          if (receipt.claimId) return receipt;
          const migrated = { ...receipt, claimId: legacyClaim!.id };
          await action('receipts', 'readwrite', store => store.put(migrated));
          return migrated;
        }));
      }
      this.claims.set(claims.sort((a, b) => b.createdAt - a.createdAt));
      this.receipts().forEach(item => { if (item.photoUrl) URL.revokeObjectURL(item.photoUrl); });
      this.receipts.set(saved.sort((a, b) => b.capturedAt - a.capturedAt).map(item => ({ ...item, photoUrl: item.photo?.type.startsWith('image/') ? URL.createObjectURL(item.photo) : undefined })));
      if (!this.claims().some(claim => claim.id === this.selectedClaimId)) this.selectedClaimId = this.visibleClaims[0]?.id ?? null;
    } catch { this.error.set('Could not load saved claims. Check browser storage settings.'); }
  }
}


