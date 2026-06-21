import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { EntityImage } from '../ui';
import { useToast } from '../ui/Toast';
import {
  BRAND_IMAGE_SPECS,
  validateBrandImageBeforeUpload,
  type AppBrandAssetType,
} from '../../utils/brand-image-specs';

interface Props {
  assetType: AppBrandAssetType;
  value: string;
  permission: string;
  onChange: (url: string) => void;
  previewClassName?: string;
}

export default function AppSettingsImageUpload({
  assetType,
  value,
  onChange,
  previewClassName = 'w-20 h-20',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const spec = BRAND_IMAGE_SPECS[assetType];
  const [errors, setErrors] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/admin/app-settings/upload/${assetType}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: (res: any) => {
      const url = res.data?.data?.url ?? '';
      onChange(url);
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      setErrors([]);
      showToast(`${spec.label} uploaded successfully!`);
    },
    onError: (err: any) => {
      const details = err?.response?.data?.details;
      const message = err?.response?.data?.message || err.message || 'Upload failed';
      if (Array.isArray(details) && details.length) {
        setErrors(details);
      } else {
        setErrors([message]);
      }
      showToast(message, 'error');
    },
  });

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setChecking(true);
    setErrors([]);
    try {
      const validation = await validateBrandImageBeforeUpload(assetType, file);
      if (!validation.ok) {
        setErrors(validation.errors);
        showToast('Image does not meet requirements', 'error');
        return;
      }
      uploadMutation.mutate(file);
    } catch {
      setErrors(['Could not validate image file.']);
      showToast('Could not validate image file', 'error');
    } finally {
      setChecking(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const busy = checking || uploadMutation.isPending;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-4">
        <div className={`${previewClassName} rounded-[var(--radius-md)] border border-[var(--color-border)] overflow-hidden bg-[var(--color-bg)] flex-shrink-0`}>
          <EntityImage src={value} name={spec.label} className={`${previewClassName} rounded-none text-lg`} />
        </div>
        <div className="flex-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept={spec.accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border border-[var(--color-border)] hover:bg-[var(--color-bg)] disabled:opacity-50"
          >
            {busy ? 'Checking…' : value ? 'Replace image' : 'Upload image'}
          </button>
          <ul className="mt-2 text-xs text-[var(--color-text-muted)] list-disc list-inside space-y-0.5">
            {spec.hints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-error)]/40 bg-[var(--color-error-bg)] px-3 py-2">
          <p className="text-xs font-medium text-[var(--color-error-text)] mb-1">Image rejected — fix these before uploading:</p>
          <ul className="text-xs text-[var(--color-error-text)] list-disc list-inside space-y-0.5">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
