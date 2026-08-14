"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { updateStyle, type StyleActionState } from "@/lib/style/actions";
import { parseStyleJson } from "@/lib/style/schema";
import { DEFAULT_STYLE_JSON } from "@/lib/style/default";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const initialState: StyleActionState = { error: null, saved: false };

export function StyleEditor({ initialJson }: { initialJson: string }) {
  const [value, setValue] = useState(initialJson);
  const [state, formAction, pending] = useActionState(updateStyle, initialState);

  const validation = useMemo(() => parseStyleJson(value), [value]);

  useEffect(() => {
    if (state.saved) toast.success("Style saved");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Textarea
        name="style_json"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={20}
        spellCheck={false}
        className="min-h-[420px] font-mono text-xs leading-relaxed"
      />
      <div className="flex items-center gap-3">
        {validation.ok ? (
          <span className="inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle2 className="size-3.5" />
            Valid JSON
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-destructive">
            <XCircle className="size-3.5" />
            {validation.error}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setValue(JSON.stringify(DEFAULT_STYLE_JSON, null, 2))}
          >
            <RotateCcw className="size-4" />
            Reset to default
          </Button>
          <Button type="submit" disabled={!validation.ok || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
    </form>
  );
}
