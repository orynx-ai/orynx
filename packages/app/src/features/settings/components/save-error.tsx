/**
 * Under a group whose change didn't save (spec 005, Q7c). The control has already gone back to the
 * saved value; the line stays until the next change.
 */
export function SaveError() {
  return (
    <p role="alert" className="m-0 text-small text-danger">
      Couldn&apos;t save that change. Check that Orynx is still running, then try again.
    </p>
  );
}
