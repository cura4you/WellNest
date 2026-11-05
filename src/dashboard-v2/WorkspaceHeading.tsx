const copy = {
  patient: ['Your health, in view.', 'Your records, your care, and the things that matter next.'],
  doctor: ['Your practice, in view.', 'Keep patient records, access requests, and appointments together.'],
  hospital: ['Your hospital, in view.', 'Stay on top of records, appointments, and your team’s access.'],
};

export function WorkspaceHeading({ role }: { role: keyof typeof copy }) {
  const [title, description] = copy[role];
  return (
    <div className="mv-overview-heading">
      <div><h2>{title}</h2><p>{description}</p></div>
      <span className="mv-workspace-pill"><span />Your workspace</span>
    </div>
  );
}
