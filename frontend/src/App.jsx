import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

// Auto-detect backend port or use Nginx proxy
const getApiUrl = () => {
  if (window.location.port === '3000') {
    return `${window.location.protocol}//${window.location.hostname}:5000`;
  }
  return ''; // Relative path in production (Nginx proxy)
};

const API_BASE = getApiUrl();

function App() {
  const [activeTab, setActiveTab] = useState('builder'); // 'builder' or 'submissions'
  const [forms, setForms] = useState([]);
  const [selectedForm, setSelectedForm] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [healthStatus, setHealthStatus] = useState({ status: 'LOADING', db: 'DOWN', redis: 'DOWN' });
  
  // Builder form states
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFields, setFormFields] = useState([
    { name: 'nombre', label: 'Nombre Completo', type: 'text', required: true, options: [] }
  ]);

  // Submission inputs answers state
  const [answers, setAnswers] = useState({});

  // Messages states
  const [builderError, setBuilderError] = useState('');
  const [builderSuccess, setBuilderSuccess] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // 1. API Calls

  // Get all forms
  const fetchForms = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/forms`);
      if (!response.ok) throw new Error('Error al obtener formularios');
      const data = await response.json();
      setForms(data);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // Get submissions for selected form
  const fetchSubmissions = useCallback(async (formId) => {
    if (!formId) return;
    try {
      const response = await fetch(`${API_BASE}/api/forms/${formId}/submissions`);
      if (!response.ok) throw new Error('Error al obtener respuestas');
      const data = await response.json();
      setSubmissions(data);

      // Keep selected submission updated
      if (selectedSubmission) {
        const updated = data.find(s => s.id === selectedSubmission.id);
        if (updated) {
          setSelectedSubmission(updated);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [selectedSubmission]);

  // Get Ecosystem health
  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/ready`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setHealthStatus({
          status: 'NOT_READY',
          db: errData.db || 'DOWN',
          redis: errData.redis || 'DOWN'
        });
        return;
      }
      const data = await response.json();
      setHealthStatus({
        status: data.status,
        db: data.db,
        redis: data.redis
      });
    } catch (error) {
      setHealthStatus({ status: 'OFFLINE', db: 'DOWN', redis: 'DOWN' });
    }
  }, []);

  // Set up periodic syncs
  useEffect(() => {
    fetchForms();
    fetchHealth();
    const formsInterval = setInterval(fetchForms, 6000);
    const healthInterval = setInterval(fetchHealth, 5000);
    return () => {
      clearInterval(formsInterval);
      clearInterval(healthInterval);
    };
  }, [fetchForms, fetchHealth]);

  // Poll submissions when tab is active and form selected
  useEffect(() => {
    if (activeTab === 'submissions' && selectedForm) {
      fetchSubmissions(selectedForm.id);
      const subInterval = setInterval(() => fetchSubmissions(selectedForm.id), 2500);
      return () => clearInterval(subInterval);
    }
  }, [activeTab, selectedForm, fetchSubmissions]);

  // Handle Form select and load definition details
  const handleSelectForm = async (form) => {
    try {
      const response = await fetch(`${API_BASE}/api/forms/${form.id}`);
      if (!response.ok) throw new Error('No se pudo cargar la definición del formulario');
      const data = await response.json();
      setSelectedForm(data);
      setAnswers({}); // Clear answers
      setSubmissions([]); // Clear old submissions
      setSelectedSubmission(null); // Clear selected submission
      setSubmitError('');
      setSubmitSuccess('');
    } catch (err) {
      setSubmitError(err.message);
    }
  };

  // 2. Form Builder Action Handlers

  const handleAddField = () => {
    const defaultName = `campo_${formFields.length + 1}`;
    setFormFields([...formFields, {
      name: defaultName,
      label: 'Nuevo Campo',
      type: 'text',
      required: false,
      options: []
    }]);
  };

  const handleRemoveField = (index) => {
    const updated = formFields.filter((_, i) => i !== index);
    setFormFields(updated);
  };

  const handleFieldChange = (index, key, val) => {
    const updated = [...formFields];
    updated[index][key] = val;

    // Auto-generate name based on label to simplify backend usage
    if (key === 'label') {
      updated[index].name = val
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/^_+|_+$/g, '');
    }

    // Default select options array if changed to select
    if (key === 'type' && val === 'select' && updated[index].options.length === 0) {
      updated[index].options = ['Opción A', 'Opción B'];
    }

    setFormFields(updated);
  };

  // Options arrays operations (for Dropdown Select fields)
  const handleAddOption = (fieldIndex) => {
    const updated = [...formFields];
    updated[fieldIndex].options.push(`Opción ${updated[fieldIndex].options.length + 1}`);
    setFormFields(updated);
  };

  const handleOptionChange = (fieldIndex, optIndex, val) => {
    const updated = [...formFields];
    updated[fieldIndex].options[optIndex] = val;
    setFormFields(updated);
  };

  const handleRemoveOption = (fieldIndex, optIndex) => {
    const updated = [...formFields];
    updated[fieldIndex].options = updated[fieldIndex].options.filter((_, i) => i !== optIndex);
    setFormFields(updated);
  };

  // Submit new Form Structure to DB
  const handleCreateForm = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      setBuilderError('El título del formulario es obligatorio.');
      return;
    }
    if (formFields.length === 0) {
      setBuilderError('Debes agregar al menos un campo al formulario.');
      return;
    }

    setBuilderError('');
    setBuilderSuccess('');

    try {
      const response = await fetch(`${API_BASE}/api/forms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle.trim(),
          description: formDesc.trim(),
          fields: formFields
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al guardar el formulario.');
      }

      const created = await response.json();
      setForms((prev) => [created, ...prev]);
      
      // Reset builder form
      setFormTitle('');
      setFormDesc('');
      setFormFields([{ name: 'nombre', label: 'Nombre Completo', type: 'text', required: true, options: [] }]);
      setBuilderSuccess('¡Plantilla de formulario creada con éxito!');
      
      // Redirect to submissions view after delay
      setTimeout(() => {
        setBuilderSuccess('');
        setSelectedForm(created);
        setActiveTab('submissions');
      }, 2000);

    } catch (err) {
      setBuilderError(err.message);
    }
  };

  // Delete Form
  const handleDeleteForm = async (formId, e) => {
    e.stopPropagation(); // Avoid selecting the form
    if (!window.confirm('¿Seguro que deseas eliminar esta plantilla y todos sus envíos?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/forms/${formId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('No se pudo borrar el formulario');
      setForms(forms.filter(f => f.id !== formId));
      if (selectedForm?.id === formId) {
        setSelectedForm(null);
        setSubmissions([]);
        setSelectedSubmission(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 3. Dynamic Submission Handlers

  const handleAnswerChange = (fieldName, val) => {
    setAnswers({ ...answers, [fieldName]: val });
  };

  const handleSubmitAnswers = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const response = await fetch(`${API_BASE}/api/forms/${selectedForm.id}/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al guardar envío');
      }

      const submission = await response.json();
      setSubmissions((prev) => [submission, ...prev]);
      setSelectedSubmission(submission);
      setAnswers({}); // Clear values
      setSubmitSuccess('Respuestas enviadas. El Worker está validando y procesando la información...');
      
      // Auto clear success alert
      setTimeout(() => setSubmitSuccess(''), 5000);
      
    } catch (err) {
      setSubmitError(err.message);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <div className="logo-icon">DF</div>
          <div className="logo-text">
            <h1>Form Builder & Submission Agent</h1>
            <span>Orquestador y Validador Dinámico</span>
          </div>
        </div>
        
        <div className="conn-status">
          <div className={`indicator ${healthStatus.status === 'READY' ? 'online' : 'offline'}`} />
          <span>Ecosistema: <strong>{healthStatus.status}</strong></span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>BD: <strong style={{ color: healthStatus.db === 'UP' ? '#10b981' : '#ef4444' }}>{healthStatus.db}</strong></span>
          <span style={{ opacity: 0.3 }}>|</span>
          <span>Redis: <strong style={{ color: healthStatus.redis === 'UP' ? '#10b981' : '#ef4444' }}>{healthStatus.redis}</strong></span>
        </div>
      </header>

      {/* Navigation tabs */}
      <div className="tabs-navigation">
        <button 
          className={`tab-btn ${activeTab === 'builder' ? 'active' : ''}`}
          onClick={() => setActiveTab('builder')}
        >
          Diseñador de Formularios
        </button>
        <button 
          className={`tab-btn ${activeTab === 'submissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('submissions')}
        >
          Diligenciar y Analizar
        </button>
      </div>

      {/* 4. Tab 1: Form Builder View */}
      {activeTab === 'builder' && (
        <div className="dashboard-grid">
          {/* Form settings */}
          <div className="card-glass animate-fade-in">
            <h2 className="card-title">Configuración Base</h2>
            <form onSubmit={handleCreateForm}>
              {builderError && <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.85rem' }}>❌ {builderError}</div>}
              {builderSuccess && <div style={{ color: 'var(--success)', marginBottom: '1rem', fontSize: '0.85rem' }}>✅ {builderSuccess}</div>}

              <div className="form-group">
                <label className="form-label" htmlFor="title">Título del Formulario</label>
                <input 
                  id="title"
                  type="text" 
                  className="form-input" 
                  placeholder="Ej. Registro de Empleados"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="desc">Descripción / Instrucciones</label>
                <textarea 
                  id="desc"
                  rows="3"
                  className="form-input" 
                  placeholder="Instrucciones para la persona que diligencia..."
                  style={{ resize: 'vertical' }}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary" 
                style={{ width: '100%', marginTop: '2rem' }}
                disabled={healthStatus.status !== 'READY'}
              >
                Guardar Plantilla de Formulario
              </button>
            </form>
          </div>

          {/* Form Fields builder list */}
          <div className="card-glass animate-fade-in" style={{ animationDelay: '0.1s' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 className="card-title" style={{ marginBottom: 0 }}>Campos del Formulario ({formFields.length})</h2>
              <button className="btn-secondary" onClick={handleAddField}>
                + Agregar Campo
              </button>
            </div>

            {formFields.length === 0 ? (
              <div className="empty-state">
                <p>No hay campos configurados. Presiona "+ Agregar Campo".</p>
              </div>
            ) : (
              <div style={{ maxHeight: '550px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                {formFields.map((field, idx) => (
                  <div className="field-builder-card" key={idx}>
                    <div className="field-builder-header">
                      <span className="field-builder-title">Campo #{idx + 1} ({field.name || 'sin_nombre'})</span>
                      {formFields.length > 1 && (
                        <button className="btn-danger-sm" onClick={() => handleRemoveField(idx)}>
                          Eliminar
                        </button>
                      )}
                    </div>

                    <div className="field-builder-grid">
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Etiqueta (Pregunta)</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          placeholder="Ej. Edad del usuario"
                          value={field.label}
                          onChange={(e) => handleFieldChange(idx, 'label', e.target.value)}
                          required
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Tipo de Campo</label>
                        <div className="select-wrapper">
                          <select 
                            className="form-input"
                            value={field.type}
                            onChange={(e) => handleFieldChange(idx, 'type', e.target.value)}
                          >
                            <option value="text">Texto</option>
                            <option value="number">Número</option>
                            <option value="date">Fecha</option>
                            <option value="select">Dropdown (Selección)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="checkbox-wrapper">
                      <input 
                        id={`req-${idx}`}
                        type="checkbox" 
                        checked={field.required}
                        onChange={(e) => handleFieldChange(idx, 'required', e.target.checked)}
                      />
                      <label htmlFor={`req-${idx}`} className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Obligatorio / Requerido</label>
                    </div>

                    {/* Options configuration if field is a dropdown */}
                    {field.type === 'select' && (
                      <div className="options-builder">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                          <span className="form-label" style={{ margin: 0 }}>Opciones del Dropdown</span>
                          <button 
                            type="button" 
                            className="btn-danger-sm" 
                            style={{ background: 'rgba(6, 182, 212, 0.1)', color: 'var(--secondary)', borderColor: 'rgba(6, 182, 212, 0.2)' }}
                            onClick={() => handleAddOption(idx)}
                          >
                            + Añadir Opción
                          </button>
                        </div>
                        {field.options.map((opt, optIdx) => (
                          <div className="option-row" key={optIdx}>
                            <input 
                              type="text" 
                              className="form-input" 
                              style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                              value={opt}
                              onChange={(e) => handleOptionChange(idx, optIdx, e.target.value)}
                              required
                            />
                            {field.options.length > 1 && (
                              <button 
                                type="button" 
                                className="btn-danger-sm" 
                                onClick={() => handleRemoveOption(idx, optIdx)}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Tab 2: Submissions Diligencing & Analytics View */}
      {activeTab === 'submissions' && (
        <div className="dashboard-grid">
          
          {/* Left panel: Form templates selection & Diligencing */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Form templates selector */}
            <div className="card-glass animate-fade-in">
              <h2 className="card-title">1. Seleccionar Formulario</h2>
              {forms.length === 0 ? (
                <div className="empty-state">
                  <p>No hay formularios creados. Dirígete a la pestaña del Diseñador.</p>
                </div>
              ) : (
                <div className="list-selector">
                  {forms.map((f) => (
                    <div 
                      key={f.id} 
                      className={`list-selector-item ${selectedForm?.id === f.id ? 'selected' : ''}`}
                      onClick={() => handleSelectForm(f)}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '600', color: '#fff' }}>{f.title}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Creado: {new Date(f.created_at).toLocaleDateString()}</span>
                      </div>
                      <button 
                        className="btn-danger-sm" 
                        onClick={(e) => handleDeleteForm(f.id, e)}
                      >
                        Borrar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Dynamic HTML rendering based on JSON definition */}
            {selectedForm && (
              <div className="card-glass animate-fade-in dynamic-form-card">
                <div className="dynamic-form-header">
                  <h2 style={{ fontSize: '1.25rem', color: '#fff' }}>{selectedForm.title}</h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{selectedForm.description || 'Sin descripción.'}</p>
                </div>

                <form onSubmit={handleSubmitAnswers}>
                  {submitError && <div style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.85rem' }}>❌ {submitError}</div>}
                  {submitSuccess && <div style={{ color: 'var(--success)', marginBottom: '1rem', fontSize: '0.85rem' }}>✅ {submitSuccess}</div>}

                  {selectedForm.fields.map((field, idx) => (
                    <div className="form-group" key={idx}>
                      <label className="form-label" htmlFor={`field-${field.name}`}>
                        {field.label} {field.required && <span style={{ color: 'var(--danger)' }}>*</span>}
                      </label>
                      
                      {field.type === 'select' ? (
                        <div className="select-wrapper">
                          <select
                            id={`field-${field.name}`}
                            className="form-input"
                            value={answers[field.name] || ''}
                            onChange={(e) => handleAnswerChange(field.name, e.target.value)}
                            required={field.required}
                          >
                            <option value="">-- Seleccionar Opción --</option>
                            {field.options.map((opt, oIdx) => (
                              <option key={oIdx} value={opt}>{opt}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <input
                          id={`field-${field.name}`}
                          type={field.type}
                          className="form-input"
                          value={answers[field.name] || ''}
                          onChange={(e) => handleAnswerChange(field.name, e.target.value)}
                          required={field.required}
                        />
                      )}
                    </div>
                  ))}

                  <button 
                    type="submit" 
                    className="btn-primary" 
                    style={{ width: '100%', marginTop: '1.5rem' }}
                    disabled={healthStatus.status !== 'READY'}
                  >
                    Enviar Respuestas al Agente
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Right panel: Submissions list & Analytics details */}
          <div className="card-glass animate-fade-in" style={{ animationDelay: '0.1s', height: 'fit-content' }}>
            <h2 className="card-title">2. Historial & Análisis Asíncrono</h2>

            {!selectedForm ? (
              <div className="empty-state">
                <p>Selecciona un formulario de la izquierda para ver el historial de ejecuciones y sus análisis de worker.</p>
              </div>
            ) : (
              <div>
                <span className="form-label" style={{ marginBottom: '0.5rem' }}>Envíos Recientes (Form: {selectedForm.title})</span>
                {submissions.length === 0 ? (
                  <div className="empty-state">
                    <p>No se registran respuestas para este formulario. Envía uno arriba.</p>
                  </div>
                ) : (
                  <div className="sub-list" style={{ marginBottom: '2rem' }}>
                    {submissions.map((sub) => (
                      <div 
                        key={sub.id} 
                        className={`sub-item ${selectedSubmission?.id === sub.id ? 'selected' : ''}`}
                        onClick={() => setSelectedSubmission(sub)}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Envío: {sub.id.substring(0, 8)}...</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Recibido: {new Date(sub.created_at).toLocaleTimeString()}</span>
                        </div>
                        <span className={`status-badge ${sub.status.toLowerCase()}`}>
                          {sub.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Submissions Detail Pane */}
                {selectedSubmission && (
                  <div className="detail-display animate-fade-in" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: '1.05rem', color: '#fff' }}>Informe de Transacción</h3>
                      <span className={`status-badge ${selectedSubmission.status.toLowerCase()}`}>
                        {selectedSubmission.status}
                      </span>
                    </div>

                    {selectedSubmission.error && (
                      <div style={{ 
                        background: 'rgba(239, 68, 68, 0.1)', 
                        border: '1px solid rgba(239, 68, 68, 0.3)', 
                        borderRadius: '8px', 
                        padding: '0.75rem 1rem', 
                        color: '#fca5a5', 
                        fontSize: '0.8rem' 
                      }}>
                        <strong>Error de validación del Worker:</strong><br />
                        {selectedSubmission.error}
                      </div>
                    )}

                    {selectedSubmission.analysis && (
                      <div>
                        <span className="form-label" style={{ marginBottom: '0.5rem' }}>Métricas de Negocio Calculadas por Worker</span>
                        <div className="metrics-grid">
                          <div className="metric-card">
                            <span className="metric-title">Completado</span>
                            <span className="metric-value">{selectedSubmission.analysis.completion_percentage}</span>
                          </div>
                          <div className="metric-card">
                            <span className="metric-title">Palabras Escritas</span>
                            <span className="metric-value">{selectedSubmission.analysis.metrics.total_words_written}</span>
                          </div>
                          <div className="metric-card">
                            <span className="metric-title">Campos Respondidos</span>
                            <span className="metric-value">{selectedSubmission.analysis.fields_summary.answered} / {selectedSubmission.analysis.fields_summary.total}</span>
                          </div>
                          <div className="metric-card">
                            <span className="metric-title">Promedio Números</span>
                            <span className="metric-value">{selectedSubmission.analysis.metrics.average_of_numeric_inputs}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="form-label" style={{ marginBottom: '0.25rem' }}>Respuestas Recibidas (answers JSON)</span>
                      <pre className="code-block">{JSON.stringify(selectedSubmission.answers, null, 2)}</pre>
                    </div>

                    {selectedSubmission.analysis && (
                      <div>
                        <span className="form-label" style={{ marginBottom: '0.25rem' }}>Payload de Análisis Completo</span>
                        <pre className="code-block" style={{ color: '#86efac' }}>{JSON.stringify(selectedSubmission.analysis, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

export default App;
