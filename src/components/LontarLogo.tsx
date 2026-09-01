import Image from 'next/image';

interface LontarLogoProps {
  variant?: 'mark' | 'full';
  priority?: boolean;
  className?: string;
}

export default function LontarLogo({ variant = 'mark', priority = false, className = '' }: LontarLogoProps) {
  if (variant === 'full') {
    return (
      <Image
        src="/lontar-logo.jpg"
        alt="LONTAR - LMS Online & Pelatihan Terpadu RSUD Johannes"
        width={1536}
        height={838}
        priority={priority}
        className={`h-auto w-full ${className}`}
      />
    );
  }

  return (
    <span
      className={`relative block h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-[#f8f6ef] ${className}`}
      aria-hidden="true"
    >
      <Image
        src="/lontar-logo.jpg"
        alt=""
        width={154}
        height={84}
        priority={priority}
        className="absolute -left-[55px] -top-[5px] h-[84px] w-[154px] max-w-none"
      />
    </span>
  );
}
