import { isImageIcon } from './navItems';

/** A navigation item's icon: a character, or an extension's image. */
export default function NavIcon({ icon, className = 'w-5 text-center' }: { icon: string; className?: string }) {
  if (isImageIcon(icon)) {
    return (
      <span aria-hidden className={`${className} inline-flex items-center justify-center`}>
        <img src={icon} alt="" className="w-4 h-4 object-contain" />
      </span>
    );
  }
  return <span aria-hidden className={className}>{icon}</span>;
}
