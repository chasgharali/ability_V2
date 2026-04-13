import React, { useState, useEffect } from 'react';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './InterpreterCategories.css';
import { interpreterCategoriesAPI } from '../../services/interpreterCategories';
import { useAuth } from '../../contexts/AuthContext';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { useToast, ToastContainer } from '../common/Toast';

export default function InterpreterCategories() {
  const { user, loading } = useAuth();
  const [categories, setCategories] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    code: '',
    color: '#000000',
    sortOrder: 0,
    isActive: true
  });
  const [saving, setSaving] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });
  const { toasts, removeToast, showSuccess, showError } = useToast();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [categoryPendingDelete, setCategoryPendingDelete] = useState(null);

  // Fetch categories
  const fetchCategories = async (page = 1) => {
    try {
      setFetching(true);
      const params = {
        page,
        limit: pagination.limit,
        search: searchTerm || undefined,
        active: activeFilter === 'all' ? undefined : activeFilter === 'active'
      };
      
      const response = await interpreterCategoriesAPI.getAll(params);
      setCategories(response.categories || []);
      setPagination(response.pagination || pagination);
    } catch (error) {
      console.error('Error fetching interpreter categories:', error);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      fetchCategories();
    }
  }, [loading, searchTerm, activeFilter]);

  useEffect(() => {
    if (!showForm) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setShowForm(false);
        setEditingCategory(null);
        resetForm();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showForm]);

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (editingCategory) {
        await interpreterCategoriesAPI.update(editingCategory._id, formData);
      } else {
        await interpreterCategoriesAPI.create(formData);
      }
      
      setShowForm(false);
      setEditingCategory(null);
      resetForm();
      showSuccess(`Category ${editingCategory ? 'updated' : 'created'} successfully`);
      fetchCategories(pagination.page);
    } catch (error) {
      console.error('Error saving interpreter category:', error);
      showError(error.response?.data?.message || 'Failed to save interpreter category', 5000);
    } finally {
      setSaving(false);
    }
  };

  // Handle edit
  const handleEdit = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name || '',
      description: category.description || '',
      code: category.code || '',
      color: category.color || '#000000',
      sortOrder: category.sortOrder || 0,
      isActive: category.isActive !== false
    });
    setShowForm(true);
  };

  // Handle delete
  const handleDelete = (category) => {
    setCategoryPendingDelete(category);
    setConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!categoryPendingDelete) return;
    
    try {
      await interpreterCategoriesAPI.delete(categoryPendingDelete._id);
      setConfirmDeleteOpen(false);
      setCategoryPendingDelete(null);
      showSuccess(`Category "${categoryPendingDelete.name}" deleted successfully`);
      fetchCategories(pagination.page);
    } catch (error) {
      console.error('Error deleting interpreter category:', error);
      showError(error.response?.data?.message || 'Failed to delete interpreter category', 5000);
    }
  };

  const cancelDelete = () => {
    setConfirmDeleteOpen(false);
    setCategoryPendingDelete(null);
  };

  // Handle toggle status
  const handleToggleStatus = async (category) => {
    try {
      await interpreterCategoriesAPI.toggleStatus(category._id);
      showSuccess(`Category "${category.name}" ${category.isActive ? 'deactivated' : 'activated'} successfully`);
      fetchCategories(pagination.page);
    } catch (error) {
      console.error('Error toggling interpreter category status:', error);
      showError(error.response?.data?.message || 'Failed to toggle interpreter category status', 5000);
    }
  };

  // Reset form
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      code: '',
      color: '#000000',
      sortOrder: 0,
      isActive: true
    });
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue =
      type === 'checkbox'
        ? checked
        : name === 'code'
          ? String(value).toUpperCase().slice(0, 10)
          : value;
    setFormData(prev => ({
      ...prev,
      [name]: nextValue
    }));
  };

  if (loading) {
    return (
      <div className="dashboard">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AdminHeader />
        <div className="dashboard-layout">
          <AdminSidebar active="interpreter-categories" />
          <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
            <div className="loading">Loading...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="interpreter-categories" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            <div className="bm-header">
              <h1>Interpreter Categories</h1>
              <ButtonComponent 
                cssClass="e-primary"
                onClick={() => {
                  setEditingCategory(null);
                  resetForm();
                  setShowForm(true);
                }}
              >
                Add New Category
              </ButtonComponent>
            </div>

            {/* Filters */}
            <div className="filters-section">
              <div className="search-filter">
                <label htmlFor="category-search" className="sr-only">Search categories</label>
                <input
                  id="category-search"
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="status-filter">
                <DropDownListComponent
                  dataSource={[
                    { value: 'all', text: 'All Categories' },
                    { value: 'active', text: 'Active Only' },
                    { value: 'inactive', text: 'Inactive Only' }
                  ]}
                  fields={{ value: 'value', text: 'text' }}
                  value={activeFilter}
                  change={(e) => setActiveFilter(e.value || 'all')}
                  placeholder="Select Status"
                  cssClass="filter-dropdown"
                  popupHeight="200px"
                  width="100%"
                />
              </div>
            </div>

            {/* Categories List */}
            <div className="categories-container">
              {fetching ? (
                <div className="loading">Loading categories...</div>
              ) : categories.length === 0 ? (
                <div className="no-data">No interpreter categories found.</div>
              ) : (
                <div className="categories-grid">
                  {categories.map((category) => (
                    <div key={category._id} className={`category-card ${!category.isActive ? 'inactive' : ''}`}>
                      <div className="category-header">
                        <div className="category-info">
                          <div 
                            className="category-color" 
                            style={{ backgroundColor: category.color }}
                          ></div>
                          <div>
                            <h3 className="category-name">{category.name}</h3>
                            <span className="category-code">{category.code}</span>
                          </div>
                        </div>
                        <div className="category-status">
                          <span className={`status-badge ${category.isActive ? 'active' : 'inactive'}`}>
                            {category.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      
                      {category.description && (
                        <p className="category-description">{category.description}</p>
                      )}
                      
                      <div className="category-meta">
                        <small>Sort Order: {category.sortOrder}</small>
                        <small>Created: {new Date(category.createdAt).toLocaleDateString()}</small>
                      </div>
                      
                      <div className="category-actions">
                        <ButtonComponent 
                          cssClass="e-primary e-small"
                          onClick={() => handleEdit(category)}
                        >
                          Edit
                        </ButtonComponent>
                        <ButtonComponent 
                          cssClass={`e-small ${category.isActive ? 'e-warning' : 'e-success'}`}
                          onClick={() => handleToggleStatus(category)}
                        >
                          {category.isActive ? 'Deactivate' : 'Activate'}
                        </ButtonComponent>
                        <ButtonComponent 
                          cssClass="e-outline e-danger e-small"
                          onClick={() => handleDelete(category)}
                        >
                          Delete
                        </ButtonComponent>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="pagination">
                <ButtonComponent 
                  cssClass="e-outline e-primary"
                  disabled={pagination.page <= 1}
                  onClick={() => fetchCategories(pagination.page - 1)}
                >
                  Previous
                </ButtonComponent>
                <span>Page {pagination.page} of {pagination.pages}</span>
                <ButtonComponent 
                  cssClass="e-outline e-primary"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => fetchCategories(pagination.page + 1)}
                >
                  Next
                </ButtonComponent>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mount delete dialog only when open so Syncfusion portals do not fight React sibling updates */}
      {confirmDeleteOpen && categoryPendingDelete && (
        <DialogComponent
          width="400px"
          visible={true}
          isModal={true}
          closeOnEscape={true}
          header="Confirm Delete"
          content={`Are you sure you want to delete "${categoryPendingDelete.name}"? This action cannot be undone.`}
          showCloseIcon={true}
          cssClass="interpreter-delete-dialog"
          buttons={[
            { buttonModel: { content: 'Cancel', cssClass: 'e-outline e-primary' }, click: cancelDelete },
            { buttonModel: { content: 'Delete', cssClass: 'e-danger', isPrimary: true }, click: confirmDelete }
          ]}
          animationSettings={{ effect: 'Zoom' }}
          close={cancelDelete}
        />
      )}

      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Form modal last: avoids insertBefore errors when toggling alongside Syncfusion overlays */}
      {showForm && (
        <div className="modal-overlay interpreter-category-modal-overlay" role="presentation">
          <div
            className="modal-content interpreter-category-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="interpreter-category-form-title"
          >
            <div className="interpreter-category-modal__header">
              <div className="interpreter-category-modal__title-wrap">
                <h3 id="interpreter-category-form-title">
                  {editingCategory ? 'Edit category' : 'Add new category'}
                </h3>
                <p className="interpreter-category-modal__subtitle">
                  {editingCategory
                    ? 'Update how this interpreter type appears in the product.'
                    : 'Define a label, short code, and color for queue and roster displays.'}
                </p>
              </div>
              <button
                type="button"
                className="interpreter-category-modal__close"
                onClick={() => {
                  setShowForm(false);
                  setEditingCategory(null);
                  resetForm();
                }}
                aria-label="Close dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="category-form interpreter-category-form">
              <div className="form-group interpreter-category-form__field">
                <label htmlFor="name">
                  Category name <span className="interpreter-category-form__required" aria-hidden="true">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  maxLength={100}
                  placeholder="e.g. English language"
                  autoComplete="off"
                />
              </div>

              <div className="form-group interpreter-category-form__field">
                <label htmlFor="code">
                  Category code <span className="interpreter-category-form__required" aria-hidden="true">*</span>
                </label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  required
                  maxLength={10}
                  placeholder="e.g. ASL, LSF"
                  className="interpreter-category-form__code-input"
                  autoComplete="off"
                  spellCheck="false"
                />
                <p className="interpreter-category-form__hint">Short uppercase code shown on badges and filters.</p>
              </div>

              <div className="form-group interpreter-category-form__field">
                <div className="interpreter-category-form__label-row">
                  <label htmlFor="description">Description</label>
                  <span className="interpreter-category-form__counter" aria-live="polite">
                    {formData.description.length}/500
                  </span>
                </div>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  maxLength={500}
                  rows={4}
                  placeholder="Optional context for admins and interpreters."
                />
              </div>

              <div className="form-row interpreter-category-form__row">
                <div className="form-group interpreter-category-form__field">
                  <label htmlFor="color">Accent color</label>
                  <div className="interpreter-category-form__color-row">
                    <input
                      type="color"
                      id="color"
                      name="color"
                      value={formData.color}
                      onChange={handleInputChange}
                      className="interpreter-category-form__color-input"
                      title="Choose a color"
                      aria-label="Category accent color"
                    />
                    <div className="interpreter-category-form__color-meta">
                      <span className="interpreter-category-form__hex" aria-hidden="true">
                        {(formData.color || '#000000').toUpperCase()}
                      </span>
                      <span className="interpreter-category-form__hint interpreter-category-form__hint--inline">
                        Used for chips and list indicators.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="form-group interpreter-category-form__field">
                  <label htmlFor="sortOrder">Sort order</label>
                  <input
                    type="number"
                    id="sortOrder"
                    name="sortOrder"
                    value={formData.sortOrder}
                    onChange={handleInputChange}
                    min={0}
                    placeholder="0"
                  />
                  <p className="interpreter-category-form__hint">Lower numbers appear first in dropdowns.</p>
                </div>
              </div>

              <div className="interpreter-category-form__active-row">
                <label className="interpreter-category-form__switch-label" htmlFor="isActive">
                  <span className="interpreter-category-form__switch-text">
                    <span className="interpreter-category-form__switch-title">Active</span>
                    <span className="interpreter-category-form__switch-desc">
                      Inactive categories stay hidden from assignment lists.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    id="isActive"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                    className="interpreter-category-form__checkbox"
                  />
                </label>
              </div>

              <div className="form-actions interpreter-category-form__actions">
                <ButtonComponent
                  type="button"
                  cssClass="e-outline e-primary"
                  onClick={(e) => {
                    e.preventDefault();
                    setShowForm(false);
                    setEditingCategory(null);
                    resetForm();
                  }}
                >
                  Cancel
                </ButtonComponent>
                <ButtonComponent
                  type="button"
                  cssClass="e-primary"
                  disabled={saving}
                  onClick={(e) => {
                    e.preventDefault();
                    handleSubmit(e);
                  }}
                >
                  {saving ? 'Saving...' : (editingCategory ? 'Update' : 'Create')}
                </ButtonComponent>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
