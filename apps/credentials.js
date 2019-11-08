export class Credentials {
	constructor(bimServerApi) {
		this.bimServerApi = bimServerApi;
		
		this.div = document.createElement("div");
		this.div.classList.add("credentials");

		this.error = document.createElement("div");
		this.div.appendChild(this.error);
		
		this.usernameInput = document.createElement("input");
		this.passwordInput = document.createElement("input");
		let loginButton = document.createElement("button");

		loginButton.innerHTML = "Login";

		let usernameLabel = document.createElement("label");
		usernameLabel.innerHTML = "Username ";
		this.div.appendChild(usernameLabel);
		usernameLabel.appendChild(this.usernameInput);

		let passwordLabel = document.createElement("label");
		passwordLabel.innerHTML = "Password ";
		this.div.appendChild(passwordLabel)
		passwordLabel.appendChild(this.passwordInput);

		this.div.appendChild(loginButton);
		
		let keypressListener = (event) => {
			if (event.keyCode == 13) {
				this.login();
			}
		};

		this.usernameInput.addEventListener("keypress", keypressListener);
		passwordLabel.addEventListener("keypress", keypressListener);
		
		loginButton.addEventListener("click", () => {
			this.login();
		});
	}
	
	login() {
		this.bimServerApi.login(this.usernameInput.value, this.passwordInput.value, () => {
			this.div.remove();
			localStorage.setItem("token", this.bimServerApi.token);
			this.resolve();
		}, (error) => {
			console.error(error);
			this.error.innerHTML = error.message;
			this.usernameInput.focus();
		});
	}
	
	getCredentials() {
		return new Promise((resolve, reject) => {
			let token = localStorage.getItem("token");
			if (token) {
				this.bimServerApi.setToken(token, () => {
					resolve();
				}, () => {
					document.body.appendChild(this.div);
					this.usernameInput.focus();
					this.resolve = resolve;
					localStorage.removeItem("token")
				});
			} else {
				document.body.appendChild(this.div);
				this.usernameInput.focus();
				this.resolve = resolve;
			}
		});
	}
}