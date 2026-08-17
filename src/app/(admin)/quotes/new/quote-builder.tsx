'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

import { previewQuote, saveQuote, type QuotePreview, type QuoteRequestInput } from '../actions';

export interface PropertyOption {
  id: string;
  label: string;
}

export interface ExtraOption {
  rateId: string;
  label: string;
  sell: number | null;
  validFrom: string;
  validTo: string;
}

interface GuestRow {
  fullName: string;
  dateOfBirth: string;
  isLead: boolean;
}

export function QuoteBuilder({
  properties,
  extras,
}: {
  properties: PropertyOption[];
  extras: ExtraOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [rooms, setRooms] = useState(1);
  const [guests, setGuests] = useState<GuestRow[]>([
    { fullName: '', dateOfBirth: '', isLead: true },
  ]);
  const [rateIds, setRateIds] = useState<string[]>([]);

  const [preview, setPreview] = useState<QuotePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  function buildInput(): QuoteRequestInput {
    return {
      propertyId,
      checkIn,
      checkOut,
      rooms,
      guests: guests
        .filter((g) => g.fullName.trim() !== '')
        .map((g) => ({
          fullName: g.fullName,
          dateOfBirth: g.dateOfBirth === '' ? null : g.dateOfBirth,
          isLead: g.isLead,
        })),
      rateIds,
    };
  }

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const result = await previewQuote(buildInput());
      if (result.ok) setPreview(result);
      else {
        setPreview(null);
        setError(result.error);
      }
    });
  }

  function runSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveQuote(buildInput());
      if (result.ok) router.push(`/quotes/${result.quoteId}`);
      else setError(result.error);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Stay</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="property">Property</Label>
              <select
                id="property"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="check-in">Check-in</Label>
                <Input id="check-in" type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="check-out">Check-out</Label>
                <Input id="check-out" type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rooms">Rooms</Label>
                <Input
                  id="rooms" type="number" min={1} max={9} value={rooms}
                  onChange={(e) => setRooms(Number(e.target.value))}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Guests</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Date of birth is required for children — ages resolve at check-in,
              and a child crossing a band boundary before arrival is charged the
              arrival price.
            </p>
            {guests.map((guest, index) => (
              <div key={index} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  {index === 0 && <Label>Full name</Label>}
                  <Input
                    value={guest.fullName}
                    placeholder="Full name"
                    onChange={(e) => updateGuest(index, { fullName: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  {index === 0 && <Label>Date of birth</Label>}
                  <Input
                    type="date"
                    value={guest.dateOfBirth}
                    onChange={(e) => updateGuest(index, { dateOfBirth: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-1 pb-2 text-sm">
                  <input
                    type="radio"
                    name="lead"
                    checked={guest.isLead}
                    onChange={() => setLead(index)}
                  />
                  lead
                </label>
                <Button
                  variant="ghost" size="sm" type="button"
                  disabled={guests.length === 1}
                  onClick={() => setGuests(guests.filter((_, i) => i !== index))}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              variant="outline" size="sm" type="button"
              onClick={() => setGuests([...guests, { fullName: '', dateOfBirth: '', isLead: false }])}
            >
              Add guest
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Extras</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {extras.length === 0 && (
              <p className="text-sm text-muted-foreground">No active extras in the catalogue.</p>
            )}
            {extras.map((extra) => (
              <label key={extra.rateId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={rateIds.includes(extra.rateId)}
                  onChange={(e) =>
                    setRateIds(
                      e.target.checked
                        ? [...rateIds, extra.rateId]
                        : rateIds.filter((id) => id !== extra.rateId),
                    )
                  }
                />
                <span>{extra.label}</span>
                <span className="text-muted-foreground">
                  {extra.sell !== null ? `AED ${extra.sell}` : 'markup-priced'} · valid {extra.validFrom} → {extra.validTo}
                </span>
              </label>
            ))}
          </CardContent>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button onClick={runPreview} disabled={pending || !checkIn || !checkOut}>
            {pending ? 'Working…' : 'Preview'}
          </Button>
          <Button
            variant="default"
            onClick={runSave}
            disabled={pending || preview === null}
          >
            Save quote
          </Button>
        </div>
      </div>

      <div>{preview && <PreviewPanel preview={preview} />}</div>
    </div>
  );

  function updateGuest(index: number, patch: Partial<GuestRow>) {
    setGuests(guests.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function setLead(index: number) {
    setGuests(guests.map((g, i) => ({ ...g, isLead: i === index })));
  }
}

function PreviewPanel({ preview }: { preview: QuotePreview }) {
  const pkg = preview.package;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Preview</CardTitle>
        {pkg.sellable ? (
          <Badge>sellable</Badge>
        ) : (
          <Badge variant="destructive">blocked</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Component</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Sell</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pkg.components.map((component, index) => (
              <TableRow key={index}>
                <TableCell>{component.description}</TableCell>
                <TableCell className="text-right">{component.unitCost.toFixed(2)}</TableCell>
                <TableCell className="text-right">{component.unitSell.toFixed(2)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="text-muted-foreground">Rounding (retained as margin)</TableCell>
              <TableCell />
              <TableCell className="text-right">{pkg.roundingDelta.toFixed(2)}</TableCell>
            </TableRow>
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{pkg.totalCost.toFixed(2)}</TableCell>
              <TableCell className="text-right">{pkg.totalSell.toFixed(2)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <div className="text-sm">
          Margin: {pkg.marginPct !== null ? `${pkg.marginPct}%` : '—'}
          {pkg.belowMarginFloor && (
            <Badge variant="outline" className="ms-2">below floor — needs approval</Badge>
          )}
        </div>

        {pkg.payableAtPropertyBreakdown.length > 0 && (
          <div className="space-y-1 rounded-md border p-3 text-sm">
            <p className="font-medium">
              Payable at the property (AED {pkg.payableAtProperty.toFixed(2)}) — never
              part of the package price
            </p>
            {pkg.payableAtPropertyBreakdown.map((line, index) => (
              <div key={index}>
                <p>{line.description}</p>
                <p dir="rtl" className="text-muted-foreground">{line.descriptionAr}</p>
              </div>
            ))}
          </div>
        )}

        {pkg.excludedExtras.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Excluded extras</p>
            {pkg.excludedExtras.map((excluded, index) => (
              <p key={index} className="text-muted-foreground">
                {excluded.detail} <Badge variant="outline">{excluded.reason}</Badge>
              </p>
            ))}
          </div>
        )}

        {pkg.tasks.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Tasks this quote will raise</p>
            {pkg.tasks.map((task, index) => (
              <p key={index}>
                <Badge variant={task.priority === 'urgent' ? 'destructive' : 'secondary'}>
                  {task.type}
                </Badge>{' '}
                {task.summary}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
