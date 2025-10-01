import React, { useState, useEffect } from 'react';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './InterpreterCategories.css';
import { interpreterCategoriesAPI } from '../../services/interpreterCategories';
import { useAuth } from '../../contexts/AuthContext';

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
      fetchCategories(pagination.page);
    } catch (error) {
      console.error('Error saving interpreter category:', error);
      alert(error.response?.data?.message || 'Failed to save interpreter category');
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
  const handleDelete = async (category) => {
    if (!window.confirm(`Are you sure you want to delete "${category.name}"?`)) {
      return;
    }
    
    try {
      await interpreterCategoriesAPI.delete(category._id);
      fetchCategories(pagination.page);
    } catch (error) {
      console.error('Error deleting interpreter category:', error);
      alert(error.response?.data?.message || 'Failed to delete interpreter category');
    }
  };

  // Handle toggle status
  const handleToggleStatus = async (category) => {
    try {
      await interpreterCategoriesAPI.toggleStatus(category._id);
      fetchCategories(pagination.page);
    } catch (error) {
      console.error('Error toggling interpreter category status:', error);
      alert(error.response?.data?.message || 'Failed to toggle interpreter category status');
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
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  if (loading) {
    return (
      <div className="dashboard">
        <AdminHeader />
        <div className="dashboard-layout">
          <AdminSidebar active="interpreter-categories" />
          <main className="dashboard-main">
            <div className="loading">Loading...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="interpreter-categories" />
        <main id="dashboard-main" className="dashboard-main">
          <div className="dashboard-content">
            <div className="bm-header">
              <h2>Interpreter Categories</h2>
              <button 
                className="dashboard-button" 
                onClick={() => {
                  setEditingCategory(null);
                  resetForm();
                  setShowForm(true);
                }}
              >
                Add New Category
              </button>
            </div>

            {/* Filters */}
            <div className="filters-section">
              <div className="search-filter">
                <input
                  type="text"
                  placeholder="Search categories..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
              <div className="status-filter">
                <select
                  value={activeFilter}
                  onChange={(e) => setActiveFilter(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Categories</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
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
                        <button 
                          className="btn-edit"
                          onClick={() => handleEdit(category)}
                        >
                          Edit
                        </button>
                        <button 
                          className={`btn-toggle ${category.isActive ? 'deactivate' : 'activate'}`}
                          onClick={() => handleToggleStatus(category)}
                        >
                          {category.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button 
                          className="btn-delete"
                          onClick={() => handleDelete(category)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="pagination">
                <button 
                  disabled={pagination.page <= 1}
                  onClick={() => fetchCategories(pagination.page - 1)}
                >
                  Previous
                </button>
                <span>Page {pagination.page} of {pagination.pages}</span>
                <button 
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => fetchCategories(pagination.page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>{editingCategory ? 'Edit Category' : 'Add New Category'}</h3>
              <button 
                className="modal-close"
                onClick={() => {
                  setShowForm(false);
                  setEditingCategory(null);
                  resetForm();
                }}
              >
                ×
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="category-form">
              <div className="form-group">
                <label htmlFor="name">Category Name *</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  maxLength={100}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="code">Category Code *</label>
                <input
                  type="text"
                  id="code"
                  name="code"
                  value={formData.code}
                  onChange={handleInputChange}
                  required
                  maxLength={10}
                  placeholder="e.g., ASL, LSF"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  maxLength={500}
                  rows={3}
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="color">Color</label>
                  <input
                    type="color"
                    id="color"
                    name="color"
                    value={formData.color}
                    onChange={handleInputChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="sortOrder">Sort Order</label>
                  <input
                    type="number"
                    id="sortOrder"
                    name="sortOrder"
                    value={formData.sortOrder}
                    onChange={handleInputChange}
                    min={0}
                  />
                </div>
              </div>
              
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={handleInputChange}
                  />
                  <span>Active</span>
                </label>
              </div>
              
              <div className="form-actions">
                <button 
                  type="button" 
                  className="btn-cancel"
                  onClick={() => {
                    setShowForm(false);
                    setEditingCategory(null);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-save"
                  disabled={saving}
                >
                  {saving ? 'Saving...' : (editingCategory ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
