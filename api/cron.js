export default async function handler(req, res) {
  // Optional: Verify that the request is coming from Vercel Cron or has a secret key
  // To use this, add CRON_SECRET to your Vercel Environment Variables
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://kbnuxtxahkybfjzbwrdk.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Recommended to use service role key for cron jobs

  if (!supabaseKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY environment variable is not set' });
  }

  try {
    console.log('Starting maintenance cron job...');

    // 1. Ping Supabase to keep it active (prevents auto-pausing on free tier)
    const pingResponse = await fetch(`${supabaseUrl}/rest/v1/users?select=id&limit=1`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    if (!pingResponse.ok) {
      throw new Error(`Supabase ping failed: ${pingResponse.statusText}`);
    }

    // 2. Mark overdue homework submissions as 'late'
    // We look for submissions that are 'pending' where the linked homework's due_date has passed
    const today = new Date().toISOString().split('T')[0];
    
    // First, find homework that is overdue
    const overdueHomeworkResponse = await fetch(
      `${supabaseUrl}/rest/v1/homework?select=id&due_date=lt.${today}`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );

    if (overdueHomeworkResponse.ok) {
      const overdueHomework = await overdueHomeworkResponse.json();
      const overdueIds = overdueHomework.map(h => h.id);

      if (overdueIds.length > 0) {
        // Update pending submissions for these homework items to 'late'
        // This is a simplified version; in a real app you'd want to be more precise
        await fetch(
          `${supabaseUrl}/rest/v1/homework_submissions?status=eq.pending&homework_id=in.(${overdueIds.join(',')})`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ status: 'late' })
          }
        );
        console.log(`Updated pending submissions to 'late' for ${overdueIds.length} overdue homework items.`);
      }
    }

    console.log('Maintenance cron job completed successfully.');

    return res.status(200).json({
      success: true,
      message: 'Cron job executed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron job failed:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
