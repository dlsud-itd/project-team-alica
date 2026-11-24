import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CategoryTagSelectorComponent } from './category-tag-selector.component';

describe('CategoryTagSelectorComponent', () => {
  let component: CategoryTagSelectorComponent;
  let fixture: ComponentFixture<CategoryTagSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CategoryTagSelectorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoryTagSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create with default category Conference', () => {
    expect(component).toBeTruthy();
    expect(component.selectedCategory()).toBe('Conference');
  });

  it('should filter categories based on search input', () => {
    component.onCategoryInputChange('hack');
    const filtered = component.filteredCategories();
    expect(filtered.some((c) => c.name === 'Hackathon')).toBe(true);
  });

  it('should emit categoryChange when selecting a category', () => {
    const spy = vi.spyOn(component.categoryChange, 'emit');
    component.selectCategory('Workshop');
    expect(component.selectedCategory()).toBe('Workshop');
    expect(spy).toHaveBeenCalledWith('Workshop');
  });

  it('should add tags and emit tagsChange', () => {
    const spy = vi.spyOn(component.tagsChange, 'emit');
    component.addTag('AI');
    component.addTag('Robotics');
    expect(component.selectedTags()).toEqual(['AI', 'Robotics']);
    expect(spy).toHaveBeenCalledWith(['AI', 'Robotics']);
  });

  it('should remove tags and emit tagsChange', () => {
    component.selectedTags.set(['AI', 'Robotics']);
    const spy = vi.spyOn(component.tagsChange, 'emit');
    component.removeTag('AI');
    expect(component.selectedTags()).toEqual(['Robotics']);
    expect(spy).toHaveBeenCalledWith(['Robotics']);
  });

  it('should handle Enter key to add tags from tag input', () => {
    component.tagInput.set('Keynote');
    component.onTagKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(component.selectedTags()).toContain('Keynote');
  });
});
