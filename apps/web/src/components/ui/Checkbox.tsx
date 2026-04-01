// apps/web/src/components/ui/Checkbox.tsx

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
};

export function Checkbox({ checked, onChange, label, description, disabled }: Props) {
  return (
    <label className="flex items-start gap-3">
      <span className="mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className={[
            "h-4 w-4 rounded border-gray-300 text-gray-900",
            "focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
            "disabled:opacity-50 disabled:pointer-events-none",
          ].join(" ")}
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-gray-600">{description}</span>
        ) : null}
      </span>
    </label>
  );
}