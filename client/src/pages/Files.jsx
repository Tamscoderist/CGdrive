import { useState, useEffect, useRef } from 'react'
import { sileo } from 'sileo'
import { getFiles, getFile, uploadFile, fetchFileBlob, deleteFile, renameFile } from '../api'
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

function formatMimeType(mime) {
  if (!mime) return '—'
  const map = {
    'application/pdf': 'PDF',
    'application/msword': 'Word (.doc)',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (.docx)',
  }
  if (map[mime]) return map[mime]
  if (mime.startsWith('image/')) return mime.replace('image/', '').toUpperCase()
  return mime.length > 20 ? mime.slice(0, 17) + '…' : mime
}

export default function Files() {
  const { user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [selectedUpload, setSelectedUpload] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const [viewer, setViewer] = useState(null) // { id, name, type, url }
  const [deleteModal, setDeleteModal] = useState(null) // { id, name }
  const [deleting, setDeleting] = useState(false)
  const [renamingId, setRenamingId] = useState(null)
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
    setSelectedFile(null)
    try {
      const file = await getFile(id)
      setSelectedFile(file)
    } catch (e) {
      const msg = e.message || ''
      const isAccess = msg.toLowerCase().includes('access denied')
      const isMissing = msg.toLowerCase().includes('file not found') || msg.toLowerCase().includes('no uploaded content') || msg.toLowerCase().includes('file missing on disk')
      sileo.error({
        title: isAccess ? 'Access denied' : isMissing ? 'File unavailable' : 'Unable to open file',
        description: msg || (isAccess
          ? 'You are not the owner of this file.'
          : isMissing
          ? 'This file record exists but the stored content is missing.'
          : 'Something went wrong opening this file.'),
      })
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setSelectedUpload(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const confirmUpload = async () => {
    if (!selectedUpload || uploading) return
    setUploading(true)
    setError('')
    try {
      await sileo.promise(uploadFile(selectedUpload), {
        loading: { title: `Uploading ${selectedUpload.name}…` },
        success: { title: 'File uploaded successfully' },
        error: (err) => ({
          title: 'Upload failed',
          description: err?.message || 'Upload failed',
        }),
      })
      setSelectedUpload(null)
      loadFiles()
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const cancelUpload = () => {
    if (uploading) return
    setSelectedUpload(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const openViewer = async (fileRow) => {
    try {
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
      const msg = e.message || ''
      const isAccess = msg.toLowerCase().includes('access denied')
      const isMissing = msg.toLowerCase().includes('no uploaded content') || msg.toLowerCase().includes('file missing on disk')
      sileo.error({
        title: isAccess ? 'Access denied' : isMissing ? 'File content missing' : 'Preview failed',
        description: msg || (isAccess
          ? 'You are not the owner of this file.'
          : isMissing
          ? 'This file record has no stored content on the server.'
          : 'Unable to load preview for this file.'),
      })
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
    const fileName = deleteModal.name
    try {
      await sileo.promise(deleteFile(deleteModal.id), {
        loading: { title: `Deleting ${fileName}…` },
        success: { title: 'File deleted successfully' },
        error: (err) => ({
          title: 'Delete failed',
          description: err?.message || 'Failed to delete file',
        }),
      })
      if (viewer?.id === deleteModal.id) closeViewer()
      setDeleteModal(null)
      loadFiles()
    } catch (e) {
      setDeleteModal(null)
    } finally {
      setDeleting(false)
    }
  }

  const handleRename = async (fileRow) => {
    if (!fileRow) return
    if (renamingId && renamingId !== fileRow.id) return
    const currentName = fileRow.original_name || fileRow.filename || `file-${fileRow.id}`
    const next = window.prompt('Enter a new name for this file:', currentName)
    if (next == null || next.trim() === '' || next.trim() === currentName) return
    setRenamingId(fileRow.id)
    try {
      await sileo.promise(renameFile(fileRow.id, next.trim()), {
        loading: { title: `Renaming ${currentName}…` },
        success: { title: 'File renamed successfully' },
        error: (err) => ({
          title: 'Rename failed',
          description: err?.message || 'Failed to rename file',
        }),
      })
      await loadFiles()
    } finally {
      setRenamingId(null)
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
          accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
        {selectedUpload && !uploading && (
          <>
            <span className="upload-preview">Selected: {selectedUpload.name}</span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirmUpload}
            >
              Confirm upload
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={cancelUpload}
            >
              Cancel
            </button>
          </>
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
                    <td className="file-cell-name" title={f.original_name || f.filename}>
                      {f.original_name || f.filename}
                    </td>
                    <td className="file-cell-type" title={f.mime_type || ''}>
                      {formatMimeType(f.mime_type)}
                    </td>
                    <td>{formatSize(f.size)}</td>
                    <td className="file-cell-owner" title={f.owner_name || f.owner_id}>
                      {f.owner_name || f.owner_id}
                    </td>
                    <td>
                      <div className="file-actions">
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
                        >
                          Preview
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleRename(f)}
                          disabled={renamingId === f.id}
                        >
                          {renamingId === f.id ? 'Renaming…' : 'Rename'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => openDeleteModal(f)}
                        >
                          Delete
                        </button>
                      </div>
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
                  You are about to delete <strong>{deleteModal.name}</strong>. This will permanently remove the file.
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
