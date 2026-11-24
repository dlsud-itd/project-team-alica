import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  STANDARD_EVENT_CATEGORIES,
  CategoryDefinition,
  normalizeCategoryName,
} from '../../core/constants/event-taxonomy.constants';

@Component({
  selector: 'app-category-tag-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './category-tag-selector.component.html',
  styleUrl: './category-tag-selector.component.scss',
})
export class CategoryTagSelectorComponent implements OnInit, OnDestroy {
  @Input() set category(val: string | null | undefined) {
    const next = val || 'Conference';
    this.selectedCategory.set(next);
    this.categoryInput.set(next);
  }
  @Input() set tags(val: string[] | null | undefined) {
    this.selectedTags.set(Array.isArray(val) ? [...val] : []);
  }

  @Output() categoryChange = new EventEmitter<string>();
  @Output() tagsChange = new EventEmitter<string[]>();

  readonly selectedCategory = signal<string>('Conference');
  readonly categoryInput = signal<string>('Conference');
  readonly isDropdownOpen = signal<boolean>(false);
  readonly selectedTags = signal<string[]>([]);
  readonly tagInput = signal<string>('');

  readonly categories = STANDARD_EVENT_CATEGORIES;

  readonly filteredCategories = computed(() => {
    const q = this.categoryInput().trim().toLowerCase();
    if (!q) return this.categories;
    return this.categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q) ||
        c.suggestedTags.some((t) => t.toLowerCase().includes(q)),
    );
  });

  readonly hasExactMatch = computed(() => {
    const q = this.categoryInput().trim().toLowerCase();
    return this.categories.some((c) => c.name.toLowerCase() === q);
  });

  readonly activeCategoryDefinition = computed(() => {
    const cat = this.selectedCategory().toLowerCase();
    return this.categories.find(
      (c) => c.name.toLowerCase() === cat || c.id.toLowerCase() === cat,
    );
  });

  readonly availableSuggestedTags = computed(() => {
    const def = this.activeCategoryDefinition();
    if (!def) return [];
    const current = new Set(this.selectedTags().map((t) => t.toLowerCase()));
    return def.suggestedTags.filter((t) => !current.has(t.toLowerCase()));
  });

  constructor(private readonly elementRef: ElementRef) {}

  private readonly onCaptureClick = (event: MouseEvent): void => {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isDropdownOpen.set(false);
    }
  };

  ngOnInit(): void {
    if (!this.selectedCategory()) {
      this.selectCategory('Conference');
    }
    document.addEventListener('click', this.onCaptureClick, true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('click', this.onCaptureClick, true);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.isDropdownOpen.set(false);
    }
  }

  onComboboxFocusOut(event: FocusEvent): void {
    const related = event.relatedTarget as Node | null;
    if (!related || !this.elementRef.nativeElement.contains(related)) {
      this.isDropdownOpen.set(false);
    }
  }

  onCategoryInputChange(value: string): void {
    this.categoryInput.set(value);
    this.isDropdownOpen.set(true);
  }

  onCategoryInputFocus(): void {
    this.isDropdownOpen.set(true);
  }

  onCategoryInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const filtered = this.filteredCategories();
      if (filtered.length > 0) {
        this.selectCategory(filtered[0].name);
      } else if (this.categoryInput().trim()) {
        this.selectCategory(this.categoryInput().trim());
      }
    } else if (event.key === 'Escape') {
      this.isDropdownOpen.set(false);
    }
  }

  selectCategory(name: string): void {
    const normalized = normalizeCategoryName(name);
    this.selectedCategory.set(normalized);
    this.categoryInput.set(normalized);
    this.isDropdownOpen.set(false);
    this.categoryChange.emit(normalized);
  }

  addTag(rawTag: string): void {
    const trimmed = rawTag.trim().replace(/^#+/, '');
    if (!trimmed) return;
    const current = this.selectedTags();
    if (!current.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      const updated = [...current, trimmed];
      this.selectedTags.set(updated);
      this.tagsChange.emit(updated);
    }
    this.tagInput.set('');
  }

  removeTag(tagToRemove: string): void {
    const updated = this.selectedTags().filter((t) => t !== tagToRemove);
    this.selectedTags.set(updated);
    this.tagsChange.emit(updated);
  }

  onTagKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addTag(this.tagInput());
    } else if (event.key === 'Backspace' && !this.tagInput() && this.selectedTags().length > 0) {
      const last = this.selectedTags()[this.selectedTags().length - 1];
      this.removeTag(last);
    }
  }
}
