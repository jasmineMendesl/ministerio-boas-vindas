import logo from '../assets/boas-vindas-logo.svg'

type BrandLogoProps = {
  className?: string
}

export function BrandLogo({ className = '' }: BrandLogoProps) {
  return <img className={className} src={logo} alt="Boas-Vindas Ministério" />
}
