import type { ShopPet } from '@ie-orbit/sdk';

export const PET_SPECIES = ['Dog', 'Cat', 'Bird', 'Rabbit', 'Other'] as const;
export const PET_SEX = ['Male', 'Female', 'Unknown'] as const;

export function formatPetBirthday(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function daysUntilBirthday(iso?: string | null): number | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [, month, day] = iso.split('-').map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), month - 1, day);
  next.setHours(0, 0, 0, 0);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

export function birthdayLabel(iso?: string | null): string {
  const days = daysUntilBirthday(iso);
  if (days == null) return '';
  if (days === 0) return 'Birthday today';
  if (days === 1) return 'Birthday tomorrow';
  if (days <= 7) return `Birthday in ${days} days`;
  return `Birthday ${formatPetBirthday(iso)}`;
}

export function upcomingBirthdayPets(pets: ShopPet[], withinDays = 7): ShopPet[] {
  return pets.filter((pet) => {
    const days = daysUntilBirthday(pet.birthday);
    return days != null && days <= withinDays;
  });
}
