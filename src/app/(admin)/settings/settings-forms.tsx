'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createBrand, createMarkupRule, updateString } from './actions';

export function BrandForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ slug: '', name: '', domain: '', fromEmail: '' });

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-4">
      <Field label="Slug">
        <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="staycations" />
      </Field>
      <Field label="Name">
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Premium Staycations" />
      </Field>
      <Field label="Domain">
        <Input value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="premiumstaycations.com" />
      </Field>
      <Field label="From email">
        <Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} placeholder="hello@…" />
      </Field>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createBrand(form);
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
      >
        Add brand
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function MarkupRuleForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sourcing, setSourcing] = useState<'api' | 'contracted'>('api');
  const [productType, setProductType] = useState<string>('');
  const [markupPct, setMarkupPct] = useState(20);
  const [effectiveFrom, setEffectiveFrom] = useState('');

  return (
    <div className="flex flex-wrap items-end gap-2 border-t pt-4">
      <Field label="Sourcing">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={sourcing}
          onChange={(e) => setSourcing(e.target.value as 'api' | 'contracted')}
        >
          <option value="api">api</option>
          <option value="contracted">contracted</option>
        </select>
      </Field>
      <Field label="Product type">
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={productType}
          onChange={(e) => setProductType(e.target.value)}
        >
          <option value="">all types</option>
          {['accommodation', 'attraction', 'dining', 'experience', 'wellness', 'transfer'].map(
            (type) => (
              <option key={type} value={type}>{type}</option>
            ),
          )}
        </select>
      </Field>
      <Field label="Markup %">
        <Input
          type="number" min={0} max={499} className="w-24"
          value={markupPct}
          onChange={(e) => setMarkupPct(Number(e.target.value))}
        />
      </Field>
      <Field label="Effective from">
        <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
      </Field>
      <Button
        disabled={pending || !effectiveFrom}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await createMarkupRule({
              brandId,
              sourcing,
              productType: (productType || null) as Parameters<typeof createMarkupRule>[0]['productType'],
              markupPct,
              effectiveFrom,
            });
            if (!result.ok) setError(result.error);
            else router.refresh();
          })
        }
      >
        Add rule
      </Button>
      {error && <p className="w-full text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function StringEditor({
  stringKey,
  en,
  ar,
  locked,
  canEdit,
}: {
  stringKey: string;
  en: string;
  ar: string | null;
  locked: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftEn, setDraftEn] = useState(en);
  const [draftAr, setDraftAr] = useState(ar ?? '');

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <code className="text-xs">{stringKey}</code>
        {locked && <Badge variant="destructive">locked</Badge>}
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <Textarea value={draftEn} onChange={(e) => setDraftEn(e.target.value)} />
          <Textarea dir="rtl" value={draftAr} onChange={(e) => setDraftAr(e.target.value)} />
          {locked && (
            <p className="text-xs text-muted-foreground">
              This is locked legal copy — the edit goes through the sanctioned
              RPC and is recorded in the audit log.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  const result = await updateString(
                    stringKey,
                    draftEn,
                    draftAr === '' ? null : draftAr,
                    locked,
                  );
                  if (!result.ok) setError(result.error);
                  else {
                    setEditing(false);
                    router.refresh();
                  }
                })
              }
            >
              Save
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 space-y-1 text-sm">
          <p>{en}</p>
          {ar && <p dir="rtl" className="text-muted-foreground">{ar}</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
