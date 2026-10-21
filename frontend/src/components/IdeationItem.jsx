export default function IdeationItem({ items }) {
  if (!items?.length) return <p className="muted">No script lines available.</p>
  return <table className="ideation-result">
    <thead><tr><th scope="col">Script</th><th scope="col">Delivery cue</th></tr></thead>
    <tbody>{items.map((item, index) => <tr key={index}>
      <td className="script-line">{item.text}</td><td className="delivery-cue">{item.gesture}</td>
    </tr>)}</tbody>
  </table>
}
