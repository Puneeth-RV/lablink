import { PHOTOS } from '../lib/photos';
import { EquipmentIcon } from './EquipmentIcon';

interface Props {
  id: string;
  name: string;
  category: string;
  /** Detail view: larger image with licence credit. */
  detail?: boolean;
}

/** Real photo when a freely licensed one exists, otherwise the category illustration. */
export function EquipmentMedia({ id, name, category, detail = false }: Props) {
  const credit = PHOTOS[id];
  if (!credit) {
    return (
      <div className={`equipment-media placeholder${detail ? ' detail' : ''}`}>
        <EquipmentIcon category={category} size={detail ? 56 : 40} />
      </div>
    );
  }
  const img = (
    <img
      className="equipment-photo"
      src={`/equipment/${id}.jpg`}
      alt={name}
      width={480}
      height={300}
      loading={detail ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
  if (!detail) return <div className="equipment-media">{img}</div>;
  return (
    <figure className="equipment-media detail">
      {img}
      <figcaption className="muted small">
        Photo: {credit.author}, {credit.license},{' '}
        <a href={credit.source} target="_blank" rel="noopener noreferrer">
          Wikimedia Commons
        </a>
      </figcaption>
    </figure>
  );
}
