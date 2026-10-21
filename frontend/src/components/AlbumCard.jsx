import { Link } from 'react-router-dom'

export default function AlbumCard({ album }) {
  const name = album.name?.trim() || 'Untitled album'
  const count = album.session_count ?? 0
  return (
    <Link to={`/albums/${album.id}`} className="album-card" aria-label={`Open album: ${name}`}>
      {album.latest_thumbnail && <img className="album-thumbnail" src={album.latest_thumbnail} alt="" loading="lazy" />}
      <div className="album-card-body">
        <h2>{name}</h2>
        <p>{count} recording{count === 1 ? '' : 's'}</p>
      </div>
      <span className="album-open" aria-hidden="true">→</span>
    </Link>
  )
}
