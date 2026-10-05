// Temporary — verifies staging deploys independently of production
// and that promoting to production actually ships this page there
// too. Delete this whole folder once that's confirmed.
export default function StagingTestPage() {
  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Staging/Production pipeline test</h1>
      <p>If you can see this on staging but NOT on production, the pipeline is working correctly.</p>
      <p>Timestamp: {new Date().toISOString()}</p>
    </div>
  );
}
