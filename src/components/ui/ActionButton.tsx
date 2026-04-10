import { Button } from './Button';

type Props = {
  disabled?: boolean;
  disabledLabel?: string;
  enabledLabel: string;
  disabledTitle?: string;
  enabledTitle?: string;
  variant?: 'primary' | 'ghost' | 'danger';
  disabledVariant?: 'primary' | 'ghost' | 'danger';
  onClick: () => void;
};

export function ActionButton({
  disabled = false,
  disabledLabel = 'Travado',
  enabledLabel,
  disabledTitle,
  enabledTitle,
  variant = 'primary',
  disabledVariant = 'ghost',
  onClick,
}: Props) {
  return (
    <Button
      disabled={disabled}
      onClick={onClick}
      title={disabled ? disabledTitle : enabledTitle}
      variant={disabled ? disabledVariant : variant}
    >
      {disabled ? disabledLabel : enabledLabel}
    </Button>
  );
}
