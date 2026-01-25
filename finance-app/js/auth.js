/**
 * Authentication Logic for FinanceFlow
 * Using Supabase Auth - Direct Connection
 */

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const errorDiv = document.getElementById('errorMessage');
    const submitBtn = document.querySelector('button[type="submit"]');

    function showError(msg) {
        if (errorDiv) {
            errorDiv.textContent = msg;
            errorDiv.style.display = 'block';
        } else {
            alert(msg);
        }
    }

    function hideError() {
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    function setLoading(isLoading) {
        if (submitBtn) {
            submitBtn.disabled = isLoading;
            submitBtn.textContent = isLoading ? 'Processing...' : (loginForm ? 'Login' : 'Sign Up');
        }
    }

    // Check if already logged in and listen for auth changes
    // This handles both initial load and auth state changes (like from email verification links)
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (session) {
            window.location.href = 'index.html';
        }
    });

    // LOGIN
    if (loginForm) {


        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            setLoading(true);

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) {
                    if (error.message.includes('Email not confirmed')) {
                        showError('Please verify your email before logging in. Check your inbox for the verification link.');
                    } else {
                        showError(error.message || 'Login failed');
                    }
                    setLoading(false);
                    return;
                }

                if (data.session) {
                    // Ensure user profile exists in users table
                    const userProfile = await ensureUserProfile(data.user);

                    // Store user info in localStorage for quick access
                    localStorage.setItem('user', JSON.stringify({
                        id: data.user.id,
                        email: data.user.email,
                        name: data.user.user_metadata?.name || userProfile?.name || 'User',
                        role: userProfile?.role || 'admin',
                        avatar: userProfile?.avatar || null,
                        phone: userProfile?.phone || null,
                        created_at: data.user.created_at
                    }));

                    window.location.href = 'index.html';
                }
            } catch (err) {
                console.error('Login error:', err);
                showError('Network error. Please check your connection.');
                setLoading(false);
            }
        });
    }

    // SIGNUP
    if (signupForm) {


        const verificationModal = document.getElementById('verificationModal');

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideError();
            setLoading(true);

            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            try {
                // First check if email already exists in users table
                const { data: existingUser } = await supabaseClient
                    .from('users')
                    .select('email')
                    .eq('email', email)
                    .maybeSingle();

                if (existingUser) {
                    showError('This email is already registered. Please login instead.');
                    setLoading(false);
                    return;
                }

                const { data, error } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            name: name
                        },
                        emailRedirectTo: window.location.origin + '/verify.html'
                    }
                });

                if (error) {
                    showError(error.message || 'Signup failed');
                    setLoading(false);
                    return;
                }

                // Check if user already exists in Supabase Auth
                // Supabase returns a user with empty identities array if email exists
                if (data.user && data.user.identities && data.user.identities.length === 0) {
                    showError('This email is already registered. Please login instead.');
                    setLoading(false);
                    return;
                }

                // Also check if we got a session (means user already verified)
                // or if user object exists but no confirmation was sent
                if (data.user && !data.session && data.user.email_confirmed_at) {
                    showError('This email is already registered. Please login instead.');
                    setLoading(false);
                    return;
                }

                if (data.user) {
                    // Create user profile in users table
                    const { error: insertError } = await supabaseClient.from('users').insert({
                        id: data.user.id,
                        name: name,
                        email: email,
                        role: 'admin',
                        is_verified: false
                    });

                    // If insert fails due to duplicate, user already exists
                    if (insertError && insertError.code === '23505') {
                        showError('This email is already registered. Please login instead.');
                        setLoading(false);
                        return;
                    }

                    // Show verification modal
                    if (verificationModal) {
                        verificationModal.classList.add('active');
                        signupForm.reset();
                        setLoading(false);
                    } else {
                        alert('Signup successful! Please check your email to verify your account.');
                        window.location.href = 'login.html';
                    }
                }
            } catch (err) {
                console.error('Signup error:', err);
                showError('Network error. Please check your connection.');
                setLoading(false);
            }
        });
    }

    // FORGOT PASSWORD
    const forgotLink = document.getElementById('forgotPasswordLink');
    const forgotModal = document.getElementById('forgotPasswordModal');
    const closeForgotBtn = document.getElementById('closeForgotModal');
    const forgotForm = document.getElementById('forgotPasswordForm');
    const sendResetBtn = document.getElementById('sendResetBtn');

    if (forgotLink && forgotModal) {
        forgotLink.addEventListener('click', (e) => {
            e.preventDefault();
            forgotModal.classList.add('active');
        });

        closeForgotBtn.addEventListener('click', () => {
            forgotModal.classList.remove('active');
        });

        // Close on outside click
        forgotModal.addEventListener('click', (e) => {
            if (e.target === forgotModal) {
                forgotModal.classList.remove('active');
            }
        });

        if (forgotForm) {
            forgotForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const resetEmail = document.getElementById('resetEmail').value;

                if (sendResetBtn) {
                    sendResetBtn.disabled = true;
                    sendResetBtn.textContent = 'Sending...';
                }

                try {
                    // Check if email belongs to an employee using our new secure RPC
                    const { data: isEmployee, error: checkError } = await supabaseClient
                        .rpc('is_employee_email', { check_email: resetEmail });

                    if (checkError) {
                        console.warn('Employee check failed:', checkError);
                        // Continue cautiously or handle error
                    }

                    if (isEmployee) {
                        alert("You are not eligible to reset password. Please contact admin.");
                        if (sendResetBtn) {
                            sendResetBtn.disabled = false;
                            sendResetBtn.textContent = 'Send Reset Link';
                        }
                        return;
                    }

                    const { error } = await supabaseClient.auth.resetPasswordForEmail(resetEmail, {
                        redirectTo: window.location.origin + '/verify.html'
                    });

                    if (error) {
                        alert(error.message);
                    } else {
                        alert('Password reset link sent! Check your email.');
                        forgotModal.classList.remove('active');
                        forgotForm.reset();
                    }
                } catch (err) {
                    console.error('Reset password error:', err);
                    alert('Network error. Please try again.');
                } finally {
                    if (sendResetBtn) {
                        sendResetBtn.disabled = false;
                        sendResetBtn.textContent = 'Send Reset Link';
                    }
                }
            });
        }
    }

    // Helper function to get user profile from database
    async function getUserProfile(userId) {
        try {
            const { data, error } = await supabaseClient
                .from('users')
                .select('name, avatar, phone, role')
                .eq('id', userId)
                .single();

            if (error) {
                console.warn('Could not fetch user profile:', error);
                return null;
            }
            return data;
        } catch (err) {
            console.warn('Error fetching user profile:', err);
            return null;
        }
    }

    /**
     * Ensure user profile exists in users table
     * Creates profile if missing, handles admin accounts created directly in Supabase
     */
    async function ensureUserProfile(user) {
        try {
            // First, try to get existing profile
            const { data: existingProfile, error: fetchError } = await supabaseClient
                .from('users')
                .select('*')
                .eq('id', user.id)
                .single();

            if (existingProfile) {
                // Profile exists, return it
                return existingProfile;
            }

            // Profile doesn't exist - determine role
            // Check if user is an employee (has admin_id in metadata)
            const isEmployee = user.user_metadata?.role === 'employee' || user.user_metadata?.admin_id;
            const role = isEmployee ? 'employee' : 'admin';

            // Create new profile
            const newProfile = {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
                role: role,
                is_verified: true,
                created_at: new Date().toISOString()
            };

            const { data: createdProfile, error: createError } = await supabaseClient
                .from('users')
                .insert(newProfile)
                .select()
                .single();

            if (createError) {
                console.warn('Could not create user profile:', createError);
                // Return a default profile so login can continue
                return { ...newProfile };
            }

            console.log(`Created user profile with role: ${role}`);
            return createdProfile;
        } catch (err) {
            console.error('Error ensuring user profile:', err);
            // Return default admin profile to prevent blocking login
            return {
                id: user.id,
                email: user.email,
                name: user.user_metadata?.name || 'User',
                role: 'admin'
            };
        }
    }
});
