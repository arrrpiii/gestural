import { useState } from 'react'
import { Link } from 'react-router-dom'
import IdeationItem from '../components/IdeationItem.jsx'

const examples = [
  {
    name: 'Product pitch',
    prompt: 'Introduce a productivity app for students',
    items: [
      { text: 'A busy week is easier when everything has a place.', gesture: 'Look into the camera. Pause before continuing.' },
      { text: 'Keep your tasks, notes, and deadlines together.', gesture: 'Use an open hand to emphasise the three points.' },
      { text: 'Spend less time planning and more time making progress.', gesture: 'Slow down and finish with a steady gaze.' },
    ],
    baseline: 'The opening felt rushed, and your hands stayed out of frame.',
    latest: 'The opening had a clear pause, and your gestures supported the main points.',
    next: 'Keep the opening pause. Practise the final sentence without looking away.',
  },
  {
    name: 'Weekly update',
    prompt: 'Share a short project update with your team',
    items: [
      { text: 'This week, we finished the first version of the project.', gesture: 'Start with relaxed shoulders and a clear voice.' },
      { text: 'Next, we are testing it with a small group of users.', gesture: 'Pause between the result and the next step.' },
      { text: 'I will share what we learn in our next update.', gesture: 'Look into the camera as you finish.' },
    ],
    baseline: 'The update was clear, but the transition to next steps was abrupt.',
    latest: 'A pause separated the result from the next step, making the update easier to follow.',
    next: 'Keep that pause and use the same structure in your next update.',
  },
]

function PreviewInvite({ destination, action }) {
  return <div className="preview-invite">
    <div><h2>{action}</h2><p>Create an account to save your work and get feedback.</p></div>
    <div className="row">
      <Link className="btn btn-primary" to="/register" state={{ from: destination }}>Create account</Link>
      <Link className="text-link" to="/login" state={{ from: destination }}>Log in</Link>
    </div>
  </div>
}

export default function WorkspacePreview({ kind }) {
  const [selected, setSelected] = useState(0)
  const example = examples[selected]
  const scripts = kind === 'scripts'
  return <div className="stack page-stack">
    <div className="page-head"><div>
      <h1>{scripts ? 'Scripts' : 'Albums'}</h1>
      <p>{scripts ? 'Turn a topic into a script with delivery cues.' : 'Keep your takes together and see how your delivery changes.'}</p>
    </div><span className="preview-label">Example workspace</span></div>
    <p className="preview-note">Explore sample content below. These examples are illustrative, not real recordings or results.</p>
    {scripts ? <div className="scripts-layout">
      <aside className="scripts-sidebar">
        <h2>Example scripts</h2>
        <div className="script-list" aria-label="Example scripts">
          {examples.map((item, index) => <button key={item.name} className={index === selected ? 'selected' : ''} aria-pressed={index === selected} onClick={() => setSelected(index)}>{item.prompt}</button>)}
        </div>
      </aside>
      <section className="script-editor" aria-label="Example script">
        <div className="script-heading"><h2>{example.prompt}</h2></div>
        <IdeationItem items={example.items} />
        <p className="preview-caption">Your saved scripts can sit beside the camera while you record.</p>
      </section>
    </div> : <>
      <div className="albums-grid" aria-label="Example albums">
        {examples.map((item, index) => <button key={item.name} className={`album-card preview-album ${index === selected ? 'selected' : ''}`} aria-pressed={index === selected} onClick={() => setSelected(index)}>
          <div className="album-card-body"><h2>{item.name}</h2><p>2 example takes</p></div>
          <span className="album-open">{index === selected ? 'Selected' : 'View example'}</span>
        </button>)}
      </div>
      <section className="preview-comparison" aria-label="Example performance review">
        <div className="page-head"><div><h2>{example.name}: progress review</h2><p>Compare feedback across recordings and find your next focus.</p></div></div>
        <div className="performance-comparison">
          <div><h3>First take</h3><p>{example.baseline}</p></div>
          <div><h3>Latest take</h3><p>{example.latest}</p></div>
        </div>
        <p className="performance-next"><strong>Next practice:</strong> {example.next}</p>
        <p className="preview-caption">Full reviews cover clarity, pacing, voice, gestures, posture, and eye contact, with links to supporting feedback.</p>
      </section>
    </>}
    <PreviewInvite destination={scripts ? '/scripts' : '/albums'} action={scripts ? 'Write your own script.' : 'Start your own album.'} />
  </div>
}
