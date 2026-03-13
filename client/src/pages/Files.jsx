import { useState, useEffect, useRef } from 'react'
import { getFiles, getFile, uploadFile, fetchFileBlob, deleteFile } from '../api'
import { useAuth } from '../context/AuthContext'
import './Files.css'

function formatSize(bytes) {
  if (typeof bytes !== 'number') return '—'
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(0)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export default function Files() {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accessDenied, setAccessDenied] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedUpload, setSelectedUpload] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const [viewer, setViewer] = useState(null) // { id, name, type, url }
  const [deleteModal, setDeleteModal] = useState(null) // { id, name }
  const [deleting, setDeleting] = useState(false)
  const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff'
  const [includeOthers, setIncludeOthers] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const fileScope = showAll ? 'all' : includeOthers ? 'others' : 'mine'

  const loadFiles = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getFiles(isStaffOrAdmin ? fileScope : 'mine')
      setFiles(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [fileScope])

  useEffect(() => {
    return () => {
      if (viewer?.url) URL.revokeObjectURL(viewer.url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleViewFile = async (id) => {
    setAccessDenied(null)
    setSelectedFile(null)
    try {
      const file = await getFile(id)
      setSelectedFile(file)
    } catch (e) {
      setAccessDenied(e.message || 'Access denied. You are not the owner of this file.')
    }
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setAccessDenied(null)
    setSelectedUpload(file)
    setUploading(true)
    try {
      await uploadFile(file)
      setSelectedUpload(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadFiles()
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const openViewer = async (fileRow) => {
    try {
      setAccessDenied(null)
      if (viewer?.url) URL.revokeObjectURL(viewer.url)

      const { blob, contentType } = await fetchFileBlob(fileRow.id)
      const url = URL.createObjectURL(blob)
      setViewer({
        id: fileRow.id,
        name: fileRow.original_name || fileRow.filename || `file-${fileRow.id}`,
        type: contentType,
        url,
      })
    } catch (e) {
      setAccessDenied(e.message || 'Access denied.')
    }
  }

  const closeViewer = () => {
    if (viewer?.url) URL.revokeObjectURL(viewer.url)
    setViewer(null)
  }

  const downloadFromViewer = () => {
    if (!viewer?.url) return
    const a = document.createElement('a')
    a.href = viewer.url
    a.download = viewer.name || 'file'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const openDeleteModal = (fileRow) => {
    setError('')
    setAccessDenied(null)
    setDeleteModal({
      id: fileRow.id,
      name: fileRow.original_name || fileRow.filename || `file-${fileRow.id}`,
    })
  }

  const closeDeleteModal = () => {
    if (deleting) return
    setDeleteModal(null)
  }

  const confirmDelete = async () => {
    if (!deleteModal || deleting) return
    setDeleting(true)
    setError('')
    setAccessDenied(null)
    try {
      await deleteFile(deleteModal.id)
      if (viewer?.id === deleteModal.id) closeViewer()
      setDeleteModal(null)
      loadFiles()
    } catch (e) {
      setAccessDenied(e.message || 'Access denied.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="files-page">
      <h1>Files (DAC)</h1>
      <p className="files-desc">
        Discretionary Access Control: only the owner can access a file. Non-owners get &quot;Access denied&quot;.
      </p>

      <div className="upload-form">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          onChange={handleFileSelect}
          className="upload-input-hidden"
          disabled={uploading}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={triggerFilePicker}
          disabled={uploading}
        >
          <span className="upload-icon">↑</span>
          {uploading ? `Uploading ${selectedUpload?.name || '…'}…` : 'Upload file'}
        </button>
        {selectedUpload && (
          <span className="upload-preview">
            {uploading ? `Uploading: ${selectedUpload.name}` : `Selected: ${selectedUpload.name}`}
          </span>
        )}
      </div>

      {isStaffOrAdmin && (
        <div className="file-view-toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={includeOthers}
              onChange={(e) => {
                setIncludeOthers(e.target.checked)
                if (e.target.checked) setShowAll(false)
              }}
            />
            Include others&apos; files (metadata only)
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => {
                setShowAll(e.target.checked)
                if (e.target.checked) setIncludeOthers(false)
              }}
            />
            Show all files (metadata only)
          </label>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {accessDenied && (
        <div className="access-denied">
          Access denied. You are not the owner of this file.
        </div>
      )}

      {loading ? (
        <p className="muted">Loading files…</p>
      ) : (
        <div className="files-list">
          {files.length === 0 ? (
            <p className="muted">No files yet. Create one above.</p>
          ) : (
            <table className="files-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Owner</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.original_name || f.filename}</td>
                    <td>{f.mime_type || '—'}</td>
                    <td>{formatSize(f.size)}</td>
                    <td>{f.owner_name || f.owner_id}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleViewFile(f.id)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openViewer(f)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => openDeleteModal(f)}
                        style={{ marginLeft: '0.5rem' }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {selectedFile && (
        <div className="file-detail">
          <h2>File: {selectedFile.filename}</h2>
          <p className="muted">Owner ID: {selectedFile.owner_id}</p>
          <p>You have access to this file (you are the owner).</p>
          <button type="button" className="btn btn-secondary" onClick={() => setSelectedFile(null)}>
            Close
          </button>
        </div>
      )}

      {viewer && (
        <div className="viewer-overlay" role="dialog" aria-modal="true">
          <div className="viewer-modal">
            <div className="viewer-header">
              <div className="viewer-title">
                <div className="viewer-name">{viewer.name}</div>
                <div className="viewer-meta">{viewer.type}</div>
              </div>
              <div className="viewer-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={downloadFromViewer}>
                  Download
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={closeViewer} style={{ marginLeft: '0.5rem' }}>
                  Close
                </button>
              </div>
            </div>

            <div className="viewer-body">
              {viewer.type.startsWith('image/') ? (
                <img className="viewer-image" src={viewer.url} alt={viewer.name} />
              ) : viewer.type === 'application/pdf' ? (
                <iframe className="viewer-iframe" src={viewer.url} title={viewer.name} />
              ) : (
                <div className="viewer-fallback">
                  <p>This file type cannot be previewed.</p>
                  <button type="button" className="btn btn-primary" onClick={downloadFromViewer}>
                    Download file
                  </button>
                </div>
              )}
            </div>
          </div>
          <button type="button" className="viewer-backdrop" onClick={closeViewer} aria-label="Close viewer" />
        </div>
      )}

      {deleteModal && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="confirm-modal">
            <div className="confirm-header">
              <div>
                <div id="delete-title" className="confirm-title">Delete file?</div>
                <div className="confirm-subtitle">
                  This will permanently remove <strong>{deleteModal.name}</strong>.
                </div>
              </div>
            </div>

            <div className="confirm-body">
              <div className="confirm-warning">
                This action cannot be undone.
              </div>
            </div>

            <div className="confirm-actions">
              <button type="button" className="btn btn-secondary" onClick={closeDeleteModal} disabled={deleting}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
          <button type="button" className="confirm-backdrop" onClick={closeDeleteModal} aria-label="Close delete dialog" />
        </div>
      )}
    </div>
  )
}
