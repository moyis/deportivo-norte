const FOUNDATION_DATE = new Date('1937-04-01');

interface Props {
  suffix?: string;
  prefix?: string;
}

export default function ClubAge({ suffix = '', prefix = '' }: Props) {
  const today = new Date();
  let years = today.getFullYear() - FOUNDATION_DATE.getFullYear();
  
  // If we haven't reached April 1st this year, subtract one year
  const anniversaryThisYear = new Date(today.getFullYear(), 3, 1); // Month is 0-indexed, so 3 = April
  if (today < anniversaryThisYear) {
    years--;
  }
  
  return <>{prefix}{years}{suffix}</>;
}
